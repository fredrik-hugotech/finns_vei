import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { hasSupabaseConfig } from '../../../lib/supabaseRest';
import { makeReceipt } from '../../../lib/receiptJob';

// Makes (or remakes) the fixed receipt for one case. It is shown on the
// public case page and in the reporter's «Mine meldinger».
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end(); }
  const rl = checkRequestRateLimit(req, 'backoffice-kvittering', 60, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forsøk.' });
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  const id = String(req.query.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Ugyldig sak' });
  try {
    const text = await makeReceipt(id);
    return res.status(200).json({ ok: true, receipt: text });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lage kvitteringen' });
  }
}
