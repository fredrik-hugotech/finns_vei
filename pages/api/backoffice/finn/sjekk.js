import { aiConfigured } from '../../../../lib/aiAssist';
import { finnGuard, md5, notConfigured, scanReports } from '../../../../lib/finnJobs';
import { triageInputHash } from '../../../../lib/aiTriage';
import {
  getReportById, getReportFlag, getReportsByIds, listOpenReportFlags, listReportsNeedingFlagScan, redactReportText,
  restoreReportText, setReportFlagStatus, setReportTriageInputHash,
} from '../../../../lib/supabaseRest';

// Hiding or restoring personal details doesn't change what the case is about,
// so Finn's assessment stays: its fingerprint is moved to the new text instead
// of sending the case back for a new assessment.
async function keepAssessment(reportId) {
  const r = await getReportById(reportId, { select: 'id,category,description,speed_limit,road_owner,road_category,reporter_type' });
  if (r) await setReportTriageInputHash(reportId, triageInputHash(r));
}

// Privacy and quality check. Finn reads report texts and flags personal
// details (children's names, licence plates, phone numbers …) and test/junk
// reports. Staff decide: hide the details in the public text (the original is
// kept and can be restored), or dismiss the flag. Nothing is deleted.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'sjekk', limit: 120 });
  if (!who) return undefined;
  try {
    if (req.method === 'GET') {
      const flags = await listOpenReportFlags();
      const reports = await getReportsByIds(flags.map((f) => f.report_id), 'id,category,description,description_original,created_at,status,reporter_type');
      const byId = new Map(reports.map((r) => [r.id, r]));
      const pending = await listReportsNeedingFlagScan(1).catch(() => []);
      return res.status(200).json({
        configured: aiConfigured(),
        unscanned: Number(pending[0]?.remaining || 0),
        items: flags.map((f) => ({ ...f, report: byId.get(f.report_id) })).filter((f) => f.report),
      });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', ['GET', 'POST']); return res.status(405).end(); }
    const { action, reportId, text } = req.body || {};

    if (action === 'scan') {
      if (!aiConfigured()) return notConfigured(res);
      const todo = await listReportsNeedingFlagScan(60);
      const batches = [];
      for (let i = 0; i < todo.length; i += 20) batches.push(todo.slice(i, i + 20));
      let found = 0; let checked = 0;
      await Promise.all(batches.map(async (b) => {
        try {
          const rows = await scanReports(b);
          checked += rows.length; found += rows.filter((r) => r.status === 'open').length;
        } catch (e) { console.error(JSON.stringify({ scope: 'finn/sjekk', event: 'batch_failed', message: String(e?.message || e).slice(0, 200) })); }
      }));
      const remaining = Math.max(0, Number(todo[0]?.remaining || 0) - checked);
      return res.status(200).json({ ok: true, checked, found, remaining });
    }

    if (!reportId) return res.status(400).json({ error: 'Mangler sak' });
    if (action === 'redact') {
      const clean = String(text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
      if (clean.length < 2) return res.status(400).json({ error: 'Teksten er tom' });
      await redactReportText(reportId, clean);
      await setReportFlagStatus(reportId, 'handled', who.by, { input_hash: md5(clean) });
      await keepAssessment(reportId).catch(() => {});
      return res.status(200).json({ ok: true });
    }
    if (action === 'restore') {
      const ok = await restoreReportText(reportId);
      if (ok) await keepAssessment(reportId).catch(() => {});
      const flag = await getReportFlag(reportId);
      if (flag) await setReportFlagStatus(reportId, 'open', who.by);
      return res.status(200).json({ ok });
    }
    if (action === 'dismiss' || action === 'handled') {
      await setReportFlagStatus(reportId, action === 'dismiss' ? 'dismissed' : 'handled', who.by);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Ukjent handling' });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/sjekk', message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Noe gikk galt.' });
  }
}
