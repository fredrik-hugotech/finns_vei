import { classifyWeather } from '../../lib/weather';
import { checkRequestRateLimit } from '../../lib/rateLimit';

// Proxy MET Norway (Yr) so the browser doesn't need to set a User-Agent
// (which it can't) and we avoid CORS. Free, no API key. We read the
// timeseries entry closest to "now" — good enough for "is it raining as the
// child heads out", without being exact to the second.
// MET terms require an identifying User-Agent with contact info.
const MET_UA = 'FinnsFairway/1.0 (https://finns-vei.vercel.app; fredrik@hugo.as)';

// Originally only ever called with the bike-tracker's own GPS fix. Now also
// called from the citizen report pick-flow's "Føre var" hint on every
// debounced map moveend, so a reporter panning around to find a spot can
// fire off a handful of lookups in quick succession — budget generously
// enough for that, tight enough to slow down a script hammering our MET
// Norway proxy.
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'weather', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ ok: false, error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  // Accept arbitrary lat/lon (not just the bike-tracker's own GPS fix) now
  // that the citizen report flow also calls this for the crosshair's
  // location — still bounded to physically valid coordinates.
  const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const validLon = Number.isFinite(lon) && lon >= -180 && lon <= 180;
  if (!validLat || !validLon) {
    return res.status(400).json({ ok: false, error: 'Mangler eller ugyldig posisjon' });
  }
  // MET asks clients to round coordinates to 4 decimals (better caching).
  const la = lat.toFixed(4);
  const lo = lon.toFixed(4);

  try {
    const r = await fetch(
      `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la}&lon=${lo}`,
      { headers: { 'User-Agent': MET_UA, Accept: 'application/json' } },
    );
    if (!r.ok) return res.status(200).json({ ok: false });
    const data = await r.json();
    const series = data?.properties?.timeseries || [];
    const now = Date.now();
    // Pick the entry nearest to now (series is hourly, ascending).
    let best = series[0];
    let bestDiff = Infinity;
    for (const entry of series.slice(0, 6)) {
      const diff = Math.abs(new Date(entry.time).getTime() - now);
      if (diff < bestDiff) { bestDiff = diff; best = entry; }
    }
    if (!best) return res.status(200).json({ ok: false });

    const instant = best.data?.instant?.details || {};
    const near = best.data?.next_1_hours || best.data?.next_6_hours || {};
    const symbolCode = near?.summary?.symbol_code || '';
    const precipMm = Number(near?.details?.precipitation_amount ?? 0) || 0;
    const tempC = Number.isFinite(Number(instant.air_temperature)) ? Number(instant.air_temperature) : null;
    const { kind, isPrecip } = classifyWeather(symbolCode, precipMm);

    // Cache briefly at the edge; weather doesn't change second to second.
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json({
      ok: true,
      symbolCode: symbolCode || null,
      precipMm,
      tempC,
      windMs: Number.isFinite(Number(instant.wind_speed)) ? Number(instant.wind_speed) : null,
      kind,
      isPrecip,
      observedAt: best.time,
    });
  } catch (_e) {
    // Never block a trip on weather — the client just skips the bonus/animation.
    return res.status(200).json({ ok: false });
  }
}
