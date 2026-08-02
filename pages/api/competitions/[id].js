import { getCompetitionStats, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

const RATE_LIMIT = 120;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'public-competition-stats', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forespørsler' });
  }

  if (!hasSupabaseConfig()) {
    return res.status(404).json({ error: 'Ikke konfigurert' });
  }

  const id = String(req.query.id || '');
  try {
    const stats = await getCompetitionStats(id, { includeGeojson: false });
    if (!stats) return res.status(404).json({ error: 'Fant ikke konkurransen' });
    // The density geojson is internal (admin only) — never expose it publicly.
    const { geojson, ...publicStats } = stats;
    res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=60');
    return res.status(200).json(publicStats);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente konkurransen' });
  }
}
