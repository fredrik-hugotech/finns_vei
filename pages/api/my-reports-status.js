import { getPublicReportsByIds, hasSupabaseConfig } from '../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../lib/rateLimit';

const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'my-reports-status', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 30);
  if (!ids.length) return res.status(200).json({ reports: [] });
  if (!hasSupabaseConfig()) return res.status(200).json({ reports: [] });

  try {
    const reports = await getPublicReportsByIds(ids);
    return res.status(200).json({ reports });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/my-reports-status', event: 'failed', message: String(error?.message || '').slice(0, 240) }));
    return res.status(500).json({ error: 'Kunne ikke hente status' });
  }
}
