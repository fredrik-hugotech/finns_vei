import { aiConfigured } from '../../../../lib/aiAssist';
import { finnCounts, finnGuard, generateBrief, latestBrief, loadRows, notConfigured } from '../../../../lib/finnJobs';
import { overviewStats, topCases } from '../../../../lib/aiStats';
import { listAiDocuments } from '../../../../lib/supabaseRest';

// Finn's brief for the backoffice front page. GET returns today's numbers and
// today's brief (if written). POST writes it (once a day, or again on demand).
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'brief', limit: req.method === 'POST' ? 10 : 120 });
  if (!who) return undefined;
  try {
    if (req.method === 'GET') {
      const rows = await loadRows();
      const [brief, counts] = await Promise.all([latestBrief(), finnCounts()]);
      const stats = overviewStats(rows, { days: 1 });
      const top = topCases(rows, 5).map((c) => ({
        id: c.id, kommune_navn: c.kommune_navn, category: c.category, summary: c.summary, measure: c.measure,
        effort: c.effort, urgency: c.urgency, support_count: c.support_count, linked_count: c.linked_count,
      }));
      const fallback = brief ? null : (await listAiDocuments('brief', 1).catch(() => []))[0] || null;
      return res.status(200).json({ configured: aiConfigured(), stats, counts, brief: brief || fallback, top, assessed: rows.filter((r) => r.urgency).length, total: rows.length });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', ['GET', 'POST']); return res.status(405).end(); }
    if (!aiConfigured()) return notConfigured(res);
    const doc = await generateBrief({ period: 'dag', by: who.by });
    return res.status(200).json({ ok: true, brief: doc });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/brief', message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Finn klarte ikke å lage oppsummeringen nå.' });
  }
}
