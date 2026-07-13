// Weather helpers shared by the API route and the client.
// We classify a MET Norway symbol_code + precipitation into a small set of
// "kinds" the UI animates, and decide whether a trip earns a weather bonus.

// MET terms require an identifying User-Agent with contact info.
const MET_UA = 'FinnsFairway/1.0 (https://finns-vei.vercel.app; fredrik@hugo.as)';

// Fetches and classifies MET Norway (Yr) weather for a lat/lon, server-side.
// Shared by pages/api/weather.js (client-facing proxy) and pages/api/bike-trips.js
// (server-side authoritative recompute of the weather bonus — see that file for
// why we never trust a client-submitted bonus flag directly). Never throws:
// callers get { ok: false } on any failure so a flaky weather lookup can never
// block a trip submission, same resilience pattern as NVDB enrichment.
export async function fetchWeatherForLocation(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return { ok: false };

  // MET asks clients to round coordinates to 4 decimals (better caching).
  const la = latNum.toFixed(4);
  const lo = lonNum.toFixed(4);

  try {
    const r = await fetch(
      `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la}&lon=${lo}`,
      { headers: { 'User-Agent': MET_UA, Accept: 'application/json' } },
    );
    if (!r.ok) return { ok: false };
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
    if (!best) return { ok: false };

    const instant = best.data?.instant?.details || {};
    const near = best.data?.next_1_hours || best.data?.next_6_hours || {};
    const symbolCode = near?.summary?.symbol_code || '';
    const precipMm = Number(near?.details?.precipitation_amount ?? 0) || 0;
    const tempC = Number.isFinite(Number(instant.air_temperature)) ? Number(instant.air_temperature) : null;
    const { kind, isPrecip } = classifyWeather(symbolCode, precipMm);

    return {
      ok: true,
      symbolCode: symbolCode || null,
      precipMm,
      tempC,
      windMs: Number.isFinite(Number(instant.wind_speed)) ? Number(instant.wind_speed) : null,
      kind,
      isPrecip,
      observedAt: best.time,
    };
  } catch (_e) {
    return { ok: false };
  }
}

export function classifyWeather(symbolCode = '', precipMm = 0) {
  const s = String(symbolCode || '').toLowerCase();
  const precip = Number(precipMm) || 0;

  let kind;
  if (/snow/.test(s)) kind = 'snow';
  else if (/sleet/.test(s)) kind = 'sleet';
  else if (/rain|shower|drizzle/.test(s)) kind = 'rain';
  else if (/fog/.test(s)) kind = 'fog';
  else if (/clearsky|fair/.test(s)) kind = 'sun';
  else if (/cloud/.test(s)) kind = 'clouds';
  else kind = precip > 0.05 ? 'rain' : 'clouds';

  // Precipitation earns the bonus: rain, sleet or snow, or any measurable mm.
  const isPrecip = kind === 'rain' || kind === 'sleet' || kind === 'snow' || precip > 0.1;
  // If it's precipitating but the symbol was generic, show it as rain (or snow).
  if (isPrecip && (kind === 'clouds' || kind === 'fog')) kind = 'rain';

  return { kind, isPrecip };
}

export const WEATHER_LABEL = {
  sun: 'Sol og fint',
  clouds: 'Skyet',
  fog: 'Tåke',
  rain: 'Regn',
  sleet: 'Sludd',
  snow: 'Snø',
};

// A short, warm bit of praise when a child heads out despite bad weather.
export function weatherPraise(kind) {
  if (kind === 'snow') return 'Tøft gjort i snøen! ❄️ Ekstrapoeng.';
  if (kind === 'sleet') return 'Sludd og alt – sterkt! Ekstrapoeng.';
  if (kind === 'rain') return 'Stå på i regnet! 💧 Ekstrapoeng.';
  return null;
}
