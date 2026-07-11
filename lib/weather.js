// Weather helpers shared by the API route and the client.
// We classify a MET Norway symbol_code + precipitation into a small set of
// "kinds" the UI animates, and decide whether a trip earns a weather bonus.

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
