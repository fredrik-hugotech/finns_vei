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
