import { aiConfigured, draftCitizenReply } from '../../../../lib/aiAssist';
import { finnGuard, notConfigured } from '../../../../lib/finnJobs';
import { getCaseTimeline, getReportById, getReportTriage, listLinkedReports } from '../../../../lib/supabaseRest';

// Finn drafts a public status update for the citizen. It only fills the text
// field on the case page — staff read, edit and publish it themselves.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'svar', limit: 40 });
  if (!who) return undefined;
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end(); }
  if (!aiConfigured()) return notConfigured(res);
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  try {
    const report = await getReportById(id, { select: 'id,status,category,description,reporter_type,support_count,trello_card_id' });
    if (!report) return res.status(404).json({ error: 'Fant ikke saken' });
    const [triage, timeline, linked] = await Promise.all([
      getReportTriage(id).catch(() => null),
      report.trello_card_id ? getCaseTimeline(report.trello_card_id) : [],
      listLinkedReports(id).catch(() => []),
    ]);
    const history = timeline.filter((t) => t.source !== 'internal').slice(-4).map((t) => t.note);
    const out = await draftCitizenReply({ report, triage, linkedCount: linked.length, history });
    return res.status(200).json({ ok: true, reply: out.reply });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/svar', id, message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Finn klarte ikke å lage et svar nå.' });
  }
}
