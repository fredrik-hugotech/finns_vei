import { isAdminRequest } from '../../../lib/backofficeAuth';
import { getStaffFromRequest } from '../../../lib/staffAuth';
import { assessSameIssue, triageConfigured } from '../../../lib/aiTriage';
import {
  getMergeCandidates, getMergeSuggestion, getReportsByIds, hasSupabaseConfig, linkReports,
  listMergeSuggestions, saveMergeSuggestion, setMergeSuggestionStatus, unlinkReport,
} from '../../../lib/supabaseRest';

// Linking reports about the same problem at the same spot into one case.
// GET: pending AI suggestions with both reports. POST actions:
//   scan    – let Claude judge up to 30 new nearby pairs (within 25 m)
//   accept  – link the newer report under the older one (reversible)
//   reject  – mark "not the same"
//   unlink  – undo a link
// Nothing is ever deleted; every report keeps counting.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  const staff = await getStaffFromRequest(req).catch(() => null);
  const by = staff?.email || 'stab';

  try {
    if (req.method === 'GET') {
      const suggestions = await listMergeSuggestions('pending');
      const ids = Array.from(new Set(suggestions.flatMap((s) => [s.primary_id, s.other_id])));
      const reports = await getReportsByIds(ids);
      const byId = new Map(reports.map((r) => [r.id, r]));
      const items = suggestions
        .map((s) => ({ ...s, primary: byId.get(s.primary_id), other: byId.get(s.other_id) }))
        .filter((s) => s.primary && s.other && !s.other.parent_report_id);
      const remaining = (await getMergeCandidates(500)).length;
      return res.status(200).json({ configured: triageConfigured(), items, unscanned: remaining });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', ['GET', 'POST']); return res.status(405).end(); }
    const { action, id, reportId } = req.body || {};

    if (action === 'scan') {
      if (!triageConfigured()) return res.status(200).json({ ok: false, reason: 'ANTHROPIC_API_KEY er ikke satt' });
      const started = Date.now();
      const pairs = await getMergeCandidates(30);
      const reports = await getReportsByIds(Array.from(new Set(pairs.flatMap((p) => [p.a_id, p.b_id]))));
      const byId = new Map(reports.map((r) => [r.id, r]));
      let found = 0; let checked = 0;
      const queue = [...pairs];
      const worker = async () => {
        while (queue.length && Date.now() - started < 240000) {
          const p = queue.shift();
          const a = byId.get(p.a_id); const b = byId.get(p.b_id);
          if (!a || !b) continue;
          try {
            const v = await assessSameIssue(a, b, p.distance_m);
            await saveMergeSuggestion({
              primary_id: a.id, other_id: b.id, distance_m: Math.round(p.distance_m * 10) / 10,
              same_issue: v.same_issue, confidence: v.confidence, reason: v.reason,
              status: v.same_issue ? 'pending' : 'rejected', model: v.model,
              decided_by: v.same_issue ? null : 'ai',
            });
            checked += 1; if (v.same_issue) found += 1;
          } catch (error) {
            console.error(JSON.stringify({ scope: 'merge-scan', a: a.id, b: b.id, error: String(error?.message || error).slice(0, 200) }));
          }
        }
      };
      await Promise.all(Array.from({ length: 5 }, worker));
      const remaining = (await getMergeCandidates(500)).length;
      return res.status(200).json({ ok: true, checked, found, remaining });
    }

    if (action === 'accept' || action === 'reject') {
      const s = await getMergeSuggestion(String(id || ''));
      if (!s) return res.status(404).json({ error: 'Fant ikke forslaget' });
      if (action === 'accept') await linkReports(s.primary_id, s.other_id, by);
      await setMergeSuggestionStatus(s.id, action === 'accept' ? 'accepted' : 'rejected', by);
      return res.status(200).json({ ok: true });
    }

    if (action === 'unlink') {
      if (!reportId) return res.status(400).json({ error: 'Mangler sak' });
      await unlinkReport(String(reportId));
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Ukjent handling' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Noe gikk galt' });
  }
}
