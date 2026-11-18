import { getReportById, hasSupabaseConfig } from '../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../lib/rateLimit';

// The fixed receipt for a report, for the app right after sending. Public,
// like the case page: the receipt holds no personal details.
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', ['GET']); return res.status(405).end(); }
  const rl = checkRequestRateLimit(req, 'report-receipt', 120, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forespørsler' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Ikke tilgjengelig' });
  const id = String(req.query.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Ugyldig sak' });
  try {
    const r = await getReportById(id, { select: 'id,receipt_text' });
    if (!r) return res.status(404).json({ error: 'Fant ikke saken' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ready: Boolean(r.receipt_text), receipt: r.receipt_text || null });
  } catch (_e) {
    return res.status(500).json({ error: 'Kunne ikke hente kvitteringen' });
  }
}
