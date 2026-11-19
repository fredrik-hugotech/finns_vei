import { waitUntil } from '@vercel/functions';
import { isAdminRequest } from '../../../lib/backofficeAuth';
import { buildReportContext, refreshSiteRoad } from '../../../lib/reportContext';
import { SITE_VERSION } from '../../../lib/nvdbSite';
import { ensureGrunnkretsChildren } from '../../../lib/ssbChildren';
import { ensureBarnehager } from '../../../lib/barnehager';
import { countReportsWithOldSite, hasSupabaseConfig, listReportsMissingContext, listReportsWithOldSite } from '../../../lib/supabaseRest';
import { timingSafeEqualStrings } from '../../../lib/timingSafeEqualStrings';

// Fills in accidents (NVDB) and children nearby for reports that don't have
// them yet, then fetches the road data again for cases looked up with an older
// version of the road lookup. ?kjede=1 hands over to a fresh run until all are done.
export const config = { maxDuration: 300 };
const PER_RUN = 150;
const CONCURRENCY = 6;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(secret) && timingSafeEqualStrings(req.headers.authorization || '', `Bearer ${secret}`);
  if (!cronOk && !(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  const started = Date.now();
  // Children per grunnkrets must be loaded before local numbers can be worked out.
  try { await ensureGrunnkretsChildren(); await ensureBarnehager(); } catch (e) { return res.status(200).json({ ok: false, reason: `Kunne ikke hente barnetall (SSB/barnehager): ${String(e?.message || e).slice(0, 120)}` }); }
  const todo = await listReportsMissingContext(PER_RUN);
  const total = Number(todo[0]?.remaining || 0);
  let done = 0; let failed = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && Date.now() - started < 240000) {
      const r = queue.shift();
      try { await buildReportContext(r); done += 1; } catch (_e) { failed += 1; }
    }
  }));
  // Road data from an older lookup (only the NVDB road part is fetched again).
  let refreshed = 0;
  if (queue.length === 0 && Date.now() - started < 200000) {
    const old = await listReportsWithOldSite(SITE_VERSION, PER_RUN * 2).catch(() => []);
    const q2 = [...old];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (q2.length && Date.now() - started < 240000) {
        const r = q2.shift();
        try { await refreshSiteRoad(r); refreshed += 1; } catch (_e) { failed += 1; }
      }
    }));
  }
  const oldLeft = await countReportsWithOldSite(SITE_VERSION).catch(() => 0);
  const remaining = Math.max(0, total - done) + Number(oldLeft || 0);
  const round = Number(req.query.runde) || 0;
  const chained = req.query.kjede === '1' && remaining > 0 && done + refreshed > 0 && round < 40 && secret;
  if (chained) {
    waitUntil((async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      try { await fetch(`https://${req.headers.host}/api/cron/ulykker?kjede=1&runde=${round + 1}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: ctl.signal }); } catch (_e) { /* handed over */ } finally { clearTimeout(t); }
    })());
  }
  return res.status(200).json({ ok: true, done, refreshed, failed, remaining, chained: Boolean(chained) });
}
