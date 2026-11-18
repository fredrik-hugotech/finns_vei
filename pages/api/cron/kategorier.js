import { waitUntil } from '@vercel/functions';
import { isAdminRequest } from '../../../lib/backofficeAuth';
import { aiConfigured } from '../../../lib/aiAssist';
import { categorizeReports } from '../../../lib/categorize';
import { hasSupabaseConfig, listReportsMissingMainCategory } from '../../../lib/supabaseRest';
import { timingSafeEqualStrings } from '../../../lib/timingSafeEqualStrings';

// Finn gives every report without one a main category (fixed list).
// ?kjede=1 hands over to a fresh run until all are done.
export const config = { maxDuration: 300 };
const PER_RUN = 300;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(secret) && timingSafeEqualStrings(req.headers.authorization || '', `Bearer ${secret}`);
  if (!cronOk && !(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  if (!aiConfigured()) return res.status(200).json({ ok: false, reason: 'ANTHROPIC_API_KEY mangler' });
  const started = Date.now();
  const todo = await listReportsMissingMainCategory(PER_RUN);
  const total = Number(todo[0]?.remaining || 0);
  const chunks = [];
  for (let i = 0; i < todo.length; i += 25) chunks.push(todo.slice(i, i + 25));
  let done = 0;
  const queue = [...chunks];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length && Date.now() - started < 240000) {
      try { done += await categorizeReports(queue.shift()); } catch (e) { console.error(JSON.stringify({ scope: 'kategorier', error: String(e?.message || e).slice(0, 200) })); }
    }
  }));
  const remaining = Math.max(0, total - done);
  const round = Number(req.query.runde) || 0;
  const chained = req.query.kjede === '1' && remaining > 0 && done > 0 && round < 20 && secret;
  if (chained) {
    waitUntil((async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      try { await fetch(`https://${req.headers.host}/api/cron/kategorier?kjede=1&runde=${round + 1}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: ctl.signal }); } catch (_e) { /* handed over */ } finally { clearTimeout(t); }
    })());
  }
  return res.status(200).json({ ok: true, done, remaining, chained: Boolean(chained) });
}
