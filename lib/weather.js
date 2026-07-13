// Weather helpers shared by the API route and the client.
// We classify a MET Norway symbol_code + precipitation into a small set of
// "kinds" the UI animates, and decide whether a trip earns a weather bonus.

// Shared "is this precipitation" rule for an already-classified kind - used by
// the API route and every client component that needs to decide whether to
// show rain/snow effects or treat a trip as ridden in bad weather, so the
// rule only has to be maintained in one place.
export function isPrecipKind(kind) {
  return kind === 'rain' || kind === 'sleet' || kind === 'snow';
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
  const isPrecip = isPrecipKind(kind) || precip > 0.1;
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
// Weather is a badge of honour ("Værhelt"), never extra points - see
// getCompetitionStats in lib/supabaseRest.js - so this only encourages, it
// never implies points are being awarded.
export function weatherPraise(kind) {
  if (kind === 'snow') return 'Tøft gjort i snøen! ❄️ Ordentlig værhelt.';
  if (kind === 'sleet') return 'Sludd og alt – sterkt gjort! 💪';
  if (kind === 'rain') return 'Stå på i regnet! 💧 Ordentlig værhelt.';
  return null;
}

// --- "Føre var": situational weather hint for the citizen report flow -----
//
// Rough Norway seasonal daylight windows, keyed by local calendar month
// (0 = January) and expressed as clock hours. This is NOT an astronomical
// sunrise/sunset calculation. MET's locationforecast symbol_code only
// carries a "_day"/"_night"/"_polartwilight" suffix for some codes
// (clearsky/fair/partlycloudy/cloudy) and not for the precipitation codes we
// mostly care about here, so it isn't a reliable source of a day/night flag
// either. For a first version we fall back to a simple local-clock-hour
// bucket per month — generous in the near-midnight-sun summer months, tight
// in the short winter days. Good enough to flag "it's dark right now"; not
// precise near sunrise/sunset or across Norway's latitude range (Oslo vs.
// Tromsø). Revisit with a real solar-position calc if this needs to be exact.
const NORWAY_DAYLIGHT_HOURS_BY_MONTH = [
  [9, 16], // Jan
  [8, 17], // Feb
  [7, 18], // Mar
  [7, 20], // Apr
  [5, 21], // May
  [4, 23], // Jun
  [4, 22], // Jul
  [6, 21], // Aug
  [7, 19], // Sep
  [7, 18], // Oct
  [8, 16], // Nov
  [9, 15], // Dec
];

export function isDarkNow(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const month = date.getMonth();
  const window = NORWAY_DAYLIGHT_HOURS_BY_MONTH[month] || [7, 18];
  const [start, end] = window;
  return hour < start || hour >= end;
}

// Which single word best names the hazard, in priority order. "Icy" (near-
// or sub-zero) beats a generic precipitation call-out since black ice is the
// sharper safety concern; snow/sleet are always called out regardless of
// amount (like weatherPraise() above treats them), while rain only counts
// once it's measurably heavy.
function primaryHazardLabel({ icy, kind, isPrecip, precipMm }) {
  if (icy) return 'Glatt';
  if (kind === 'snow') return 'Snø';
  if (kind === 'sleet') return 'Sludd';
  if (isPrecip && kind === 'rain' && Number(precipMm) >= 1) return 'Mye regn';
  return null;
}

// Purely informational hazard hint for the citizen report flow (pages/index.js,
// the "Føre var" pick-mode hint) — distinct from weatherPraise() above, which
// is a celebratory message for the children's cycling tracker. This never
// auto-selects a report category and the caller must never let it block
// submission; it only returns a short line of context or null when nothing
// hazardous applies. "Icy" is approximated as air temperature at or just
// above freezing (<= 1°C), since the ground/road can stay below freezing
// even when the air reads slightly above it.
export function reportWeatherHint({ tempC, precipMm, kind, isPrecip, dark } = {}) {
  const icy = Number.isFinite(tempC) && Number(tempC) <= 1;
  const label = primaryHazardLabel({ icy, kind, isPrecip, precipMm });
  if (!label && !dark) return null;
  const text = label
    ? (dark ? `${label} og mørkt akkurat nå` : `${label} akkurat nå`)
    : 'Mørkt akkurat nå';
  return { icy, dark: Boolean(dark), kind: kind || null, text };
}
