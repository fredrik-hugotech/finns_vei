import { listCompetitions, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Public, unauthenticated GET - rate limit it the same way as the other
// public proxy/compute endpoints.
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'competitions-index', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  if (!hasSupabaseConfig()) {
    return res.status(200).json({ competitions: [] });
  }

  try {
    const competitions = await listCompetitions({ activeOnly: true });
    return res.status(200).json({ competitions });
  } catch (error) {
    // Additive feature: before the `competitions` table exists (or on any read
    // error) return an empty list rather than surfacing an error to the map.
    console.error(error);
    return res.status(200).json({ competitions: [] });
  }
}
