import { getCompetitionStats, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Public, unauthenticated GET - getCompetitionStats() does real compute
// (grid-aggregation over up to 5000 trip rows) on every call, so rate limit
// it the same way as the other public proxy/compute endpoints.
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'competitions-id', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  if (!hasSupabaseConfig()) {
    return res.status(404).json({ error: 'Ikke konfigurert' });
  }

  const id = String(req.query.id || '');
  try {
    const stats = await getCompetitionStats(id);
    if (!stats) return res.status(404).json({ error: 'Fant ikke konkurransen' });
    // The density geojson is internal (admin only) — never expose it publicly.
    const { geojson, ...publicStats } = stats;
    return res.status(200).json(publicStats);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente konkurransen' });
  }
}
