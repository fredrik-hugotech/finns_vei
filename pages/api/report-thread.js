import { getReportThread, hasSupabaseConfig } from '../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../lib/rateLimit';

const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'report-thread', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id) return res.status(400).json({ error: 'Mangler id' });
  if (!hasSupabaseConfig()) return res.status(200).json(null);

  try {
    const thread = await getReportThread(id);
    return res.status(200).json(thread);
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/report-thread', event: 'failed', message: String(error?.message || '').slice(0, 240) }));
    return res.status(500).json({ error: 'Kunne ikke hente saken' });
  }
}
