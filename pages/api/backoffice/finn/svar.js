import { aiConfigured } from '../../../../lib/aiAssist';
import { composeFactMessage } from '../../../../lib/factJob';
import { finnGuard, notConfigured } from '../../../../lib/finnJobs';
import { getReportById } from '../../../../lib/supabaseRest';

// «Finn foreslår svar»: Finn's fact-based message (lib/factMessage.js) — facts
// about the place, no measures, no promises. It only fills the text field on
// the case page; staff read, edit and publish it themselves.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'svar', limit: 40 });
  if (!who) return undefined;
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end(); }
  if (!aiConfigured()) return notConfigured(res);
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  try {
    const report = await getReportById(id, { select: 'id' });
    if (!report) return res.status(404).json({ error: 'Fant ikke saken' });
    const draft = await composeFactMessage(id);
    return res.status(200).json({ ok: true, reply: draft.message });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/svar', id, message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: String(error?.message || '').includes('fakta') || String(error?.message || '').includes('lovnader') ? error.message : 'Finn klarte ikke å lage et svar nå.' });
  }
}
