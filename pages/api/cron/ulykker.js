import { waitUntil } from '@vercel/functions';
import { isAdminRequest } from '../../../lib/backofficeAuth';
import { buildReportContext } from '../../../lib/reportContext';
import { ensureGrunnkretsChildren } from '../../../lib/ssbChildren';
import { hasSupabaseConfig, listReportsMissingContext } from '../../../lib/supabaseRest';
import { timingSafeEqualStrings } from '../../../lib/timingSafeEqualStrings';

// Fills in accidents (NVDB) and children nearby for reports that don't have
// them yet. ?kjede=1 hands over to a fresh run until all are done.
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
  try { await ensureGrunnkretsChildren(); } catch (e) { return res.status(200).json({ ok: false, reason: `Kunne ikke hente barnetall fra SSB: ${String(e?.message || e).slice(0, 120)}` }); }
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
  const remaining = Math.max(0, total - done);
  const round = Number(req.query.runde) || 0;
  const chained = req.query.kjede === '1' && remaining > 0 && done > 0 && round < 40 && secret;
  if (chained) {
    waitUntil((async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      try { await fetch(`https://${req.headers.host}/api/cron/ulykker?kjede=1&runde=${round + 1}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: ctl.signal }); } catch (_e) { /* handed over */ } finally { clearTimeout(t); }
    })());
  }
  return res.status(200).json({ ok: true, done, failed, remaining, chained: Boolean(chained) });
}
