import { fetchWeatherForLocation } from '../../lib/weather';
import { checkRequestRateLimit } from '../../lib/rateLimit';

// Proxy MET Norway (Yr) so the browser doesn't need to set a User-Agent
// (which it can't) and we avoid CORS. Free, no API key. We read the
// timeseries entry closest to "now" — good enough for "is it raining as the
// child heads out", without being exact to the second.

// Public, unauthenticated, and called during both location picking and live
// trip tracking, so it needs the same abuse guard every other public write
// endpoint has (report / report-support / bike-trips / staff login). Budget
// is generous since a single trip can legitimately call this a couple of
// times and a family may share a wifi/NAT.
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  const rateLimit = checkRequestRateLimit(req, 'weather', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ ok: false, error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ ok: false, error: 'Mangler posisjon' });
  }

  const result = await fetchWeatherForLocation(lat, lon);
  if (!result.ok) return res.status(200).json({ ok: false });

  // Cache briefly at the edge; weather doesn't change second to second.
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
  return res.status(200).json(result);
}
