import { aiConfigured, askData } from '../../../../lib/aiAssist';
import { finnGuard, loadRows, notConfigured } from '../../../../lib/finnJobs';

// «Spør Finn»: questions about the cases, answered with counted numbers.
export const config = { maxDuration: 180 };

export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'spor', limit: 40 });
  if (!who) return undefined;
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end(); }
  if (!aiConfigured()) return notConfigured(res);
  const question = String(req.body?.question || '').trim().slice(0, 1000);
  if (question.length < 3) return res.status(400).json({ error: 'Skriv et spørsmål' });
  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .filter((h) => h && typeof h.q === 'string' && typeof h.a === 'string')
    .map((h) => ({ q: h.q.slice(0, 1000), a: h.a.slice(0, 4000) }));
  try {
    const rows = await loadRows();
    const out = await askData(question, rows, history);
    return res.status(200).json({ ok: true, answer: out.answer, steps: out.tools.length });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/spor', message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Finn klarte ikke å svare nå. Prøv igjen.' });
  }
}
