import { waitUntil } from '@vercel/functions';
import { timingSafeEqualStrings } from '../../../lib/timingSafeEqualStrings';
import { isAdminRequest } from '../../../lib/backofficeAuth';
import { assessReport, triageConfigured, triageInputHash, triageRow } from '../../../lib/aiTriage';
import { hasSupabaseConfig, listReportsNeedingFlagScan, listReportsNeedingTriage, saveReportTriage } from '../../../lib/supabaseRest';
import { generateBrief, latestBrief, scanReports } from '../../../lib/finnJobs';
import { buildReportContext, ensureReportContext } from '../../../lib/reportContext';
import { ensureGrunnkretsChildren } from '../../../lib/ssbChildren';
import { ensureBarnehager } from '../../../lib/barnehager';
import { getKommuneBarn, listReportsMissingContext, listReportsMissingMainCategory, oldestKommuneRegistrering, saveKommuneRegistrering } from '../../../lib/supabaseRest';
import { ensureCoverage } from '../../../lib/nvdbCoverage';
import { categorizeReports } from '../../../lib/categorize';
import { draftDueFactMessages } from '../../../lib/factJob';

// Nightly (vercel.json), and from the «Vurder ventende» button, Claude assesses reports that have no
// assessment yet, or whose text changed. A batch per run keeps each function
// call short; a backlog of a thousand reports is cleared in a few hours.
export const config = { maxDuration: 300 };
const PER_RUN = 60;
const CONCURRENCY = 8;
// A run started with ?kjede=1 hands over to a fresh run when it finishes, so a
// full re-assessment completes on the server without anyone keeping a tab open.
const MAX_CHAIN = 60;

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
  // Nightly run: also write Finn's morning brief and check new texts for
  // personal details, before the triage batch.
  if (authorized(req) && req.query.kjede !== '1') {
    await Promise.all([
      latestBrief().then((b) => (b ? null : generateBrief({ period: 'dag', by: 'cron' }))).catch((e) => console.error(JSON.stringify({ scope: 'ai-triage', event: 'brief_failed', error: String(e?.message || e).slice(0, 200) }))),
      ensureGrunnkretsChildren().then(() => ensureBarnehager()).then(() => listReportsMissingContext(150)).then(async (todo) => {
        for (const r of todo) { try { await buildReportContext(r); } catch (_e) { /* next night */ } }
      }).catch(() => {}),
      listReportsMissingMainCategory(200).then((todo) => categorizeReports(todo)).catch(() => {}),
      draftDueFactMessages(40).catch(() => {}),
      ensureCoverage({ oldest: await oldestKommuneRegistrering().catch(() => null), kommuneBarn: await getKommuneBarn().catch(() => new Map()), save: saveKommuneRegistrering }).catch(() => {}),
      listReportsNeedingFlagScan(100).then(async (todo) => {
        for (let i = 0; i < todo.length; i += 20) await scanReports(todo.slice(i, i + 20));
      }).catch((e) => console.error(JSON.stringify({ scope: 'ai-triage', event: 'flags_failed', error: String(e?.message || e).slice(0, 200) }))),
    ]);
  }
  const { reports, hashByReport } = await listReportsNeedingTriage();
  const todo = reports.filter((r) => hashByReport.get(r.id) !== triageInputHash(r)).slice(0, PER_RUN);
  let done = 0; let failed = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length && Date.now() - started < 270000) {
      const r = queue.shift();
      try {
        const ctx = await ensureReportContext(r).catch(() => null);
        const a = await assessReport(r, { nearby: nearbyCount(reports, r), ctx });
        await saveReportTriage(triageRow(r, a));
        done += 1;
      } catch (error) {
        failed += 1;
        console.error(JSON.stringify({ scope: 'ai-triage', reportId: r.id, error: String(error?.message || error).slice(0, 300) }));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const remaining = Math.max(0, reports.filter((r) => hashByReport.get(r.id) !== triageInputHash(r)).length - done);
  const round = Number(req.query.runde) || 0;
  const chained = req.query.kjede === '1' && remaining > 0 && done > 0 && round < MAX_CHAIN && process.env.CRON_SECRET;
  if (chained) {
    const next = `https://${req.headers.host}/api/cron/ai-triage?kjede=1&runde=${round + 1}`;
    // Start the next run and let go after a few seconds; it keeps running on
    // its own. Only server-to-server with CRON_SECRET.
    waitUntil((async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      try { await fetch(next, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: ctl.signal }); } catch (_e) { /* handed over */ } finally { clearTimeout(t); }
    })());
  }
  return res.status(200).json({ ok: true, assessed: done, failed, remaining, chained: Boolean(chained) });
}
