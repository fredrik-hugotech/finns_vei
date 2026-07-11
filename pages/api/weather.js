import { classifyWeather } from '../../lib/weather';

// Proxy MET Norway (Yr) so the browser doesn't need to set a User-Agent
// (which it can't) and we avoid CORS. Free, no API key. We read the
// timeseries entry closest to "now" — good enough for "is it raining as the
// child heads out", without being exact to the second.
// MET terms require an identifying User-Agent with contact info.
const MET_UA = 'FinnsFairway/1.0 (https://finns-vei.vercel.app; fredrik@hugo.as)';

export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ ok: false, error: 'Mangler posisjon' });
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
