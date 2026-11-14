import { timingSafeEqualStrings } from '../../../lib/timingSafeEqualStrings';
import { isAdminRequest } from '../../../lib/backofficeAuth';
import { assessReport, triageConfigured, triageInputHash } from '../../../lib/aiTriage';
import { hasSupabaseConfig, listReportsNeedingTriage, saveReportTriage } from '../../../lib/supabaseRest';

// Every 10 minutes (vercel.json) Claude assesses reports that have no
// assessment yet, or whose text changed. A batch per run keeps each function
// call short; a backlog of a thousand reports is cleared in a few hours.
export const config = { maxDuration: 300 };
const PER_RUN = 60;
const CONCURRENCY = 6;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqualStrings(req.headers.authorization || '', `Bearer ${secret}`);
}

function nearbyCount(all, r) {
  const lat = Number(r.lat); const lng = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0;
  const dLat = 150 / 111320; const dLng = 150 / (111320 * Math.cos((lat * Math.PI) / 180));
  return all.filter((o) => o.id !== r.id && Math.abs(o.lat - lat) <= dLat && Math.abs(o.lng - lng) <= dLng).length;
}

export default async function handler(req, res) {
  if (!authorized(req) && !(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  if (!triageConfigured()) return res.status(200).json({ ok: false, reason: 'ANTHROPIC_API_KEY er ikke satt' });

  const started = Date.now();
  const { reports, hashByReport } = await listReportsNeedingTriage();
  const todo = reports.filter((r) => hashByReport.get(r.id) !== triageInputHash(r)).slice(0, PER_RUN);
  let done = 0; let failed = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length && Date.now() - started < 270000) {
      const r = queue.shift();
      try {
        const a = await assessReport(r, { nearby: nearbyCount(reports, r) });
        await saveReportTriage({
          report_id: r.id,
          input_hash: triageInputHash(r),
          summary: a.summary, measure_type: a.measure_type, measure: a.measure, effort: a.effort,
          responsible: a.responsible, urgency: a.urgency, quick_win: Boolean(a.quick_win),
          needs_site_visit: Boolean(a.needs_site_visit), next_steps: a.next_steps || [],
          rationale: a.rationale || '', model: a.model, created_at: new Date().toISOString(),
        });
        done += 1;
      } catch (error) {
        failed += 1;
        console.error(JSON.stringify({ scope: 'ai-triage', reportId: r.id, error: String(error?.message || error).slice(0, 300) }));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const remaining = reports.filter((r) => hashByReport.get(r.id) !== triageInputHash(r)).length - done;
  return res.status(200).json({ ok: true, assessed: done, failed, remaining: Math.max(0, remaining) });
}
