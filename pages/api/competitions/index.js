import { listCompetitions, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

const RATE_LIMIT = 120;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'public-competitions-list', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forespørsler' });
  }

  if (!hasSupabaseConfig()) {
    return res.status(200).json({ competitions: [] });
  }

  try {
    const competitions = await listCompetitions({ activeOnly: true });
    // Same short CDN-cache pattern as /api/reports — absorbs concurrent-burst
    // load without staling the list of active competitions noticeably.
    res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=60');
    return res.status(200).json({ competitions });
  } catch (error) {
    // Additive feature: before the `competitions` table exists (or on any read
    // error) return an empty list rather than surfacing an error to the map.
    console.error(error);
    return res.status(200).json({ competitions: [] });
  }
}
