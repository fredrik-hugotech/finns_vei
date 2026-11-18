import { categoryPhrase } from './mainCategories';

// The fixed receipt to the person who reported. Filled in by code, never
// written by AI: {tema} is the main category's phrase, {sted} is the road at
// the report (NVDB road network) or the nearest address, and the municipality
// (Kartverket). Nothing from the citizen's own text is repeated.
const NVDB = (process.env.NVDB_BASE_URL || 'https://nvdbapiles.atlas.vegvesen.no').replace(/\/+$/, '');

async function getJson(url, headers = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch (_e) { return null; } finally { clearTimeout(t); }
}

function meters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
function nearestM(wkt, here) {
  const s = String(wkt || '');
  const dim = /\bZ\b/i.test(s) ? 3 : 2;
  const n = (s.replace(/^[A-Z\s]+/i, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  let best = Infinity;
  for (let i = 0; i + 1 < n.length; i += dim) {
    let a = n[i]; let b = n[i + 1];
    if (Math.abs(a) < 40 && Math.abs(b) > 40) [a, b] = [b, a];
    best = Math.min(best, meters(here, { lat: a, lng: b }));
  }
  return best;
}

// Returns { road, kommune } for a point; either may be null.
export async function placeFor({ lat, lng }) {
  const here = { lat: Number(lat), lng: Number(lng) };
  const dLat = 40 / 111320; const dLng = 40 / (111320 * Math.cos((here.lat * Math.PI) / 180));
  const bbox = [here.lng - dLng, here.lat - dLat, here.lng + dLng, here.lat + dLat].map((v) => v.toFixed(6)).join(',');
  const [segs, kommune, addr] = await Promise.all([
    getJson(`${NVDB}/vegnett/api/v4/veglenkesekvenser/segmentert?srid=4326&antall=100&kartutsnitt=${bbox}`, { 'X-Client': 'finnsvei' }),
    getJson(`https://ws.geonorge.no/kommuneinfo/v1/punkt?nord=${here.lat}&ost=${here.lng}&koordsys=4258`),
    getJson(`https://ws.geonorge.no/adresser/v1/punktsok?lat=${here.lat}&lon=${here.lng}&radius=60&treffPerSide=1`),
  ]);
  const named = (segs?.objekter || [])
    .filter((o) => o.adresse?.navn && /bilveg|kanalisert|rundkjøring|gang- og sykkelveg|gangveg|fortau/i.test(o.typeVeg || ''))
    .map((o) => ({ navn: o.adresse.navn, m: nearestM(o.geometri?.wkt, here), car: /bilveg|kanalisert|rundkjøring/i.test(o.typeVeg || '') }))
    .filter((o) => o.m <= 40)
    .sort((a, b) => (b.car - a.car) || (a.m - b.m));
  const road = named[0]?.navn || addr?.adresser?.[0]?.adressenavn || null;
  return { road: road ? road.trim() : null, kommune: kommune?.kommunenavn || null };
}

export function placePhrase({ road, kommune }) {
  if (road && kommune) return `ved ${road} i ${kommune}`;
  if (road) return `ved ${road}`;
  if (kommune) return `i ${kommune}`;
  return '';
}

export function buildReceipt({ mainCategory, place }) {
  const sted = placePhrase(place || {});
  return [
    `Takk for at du meldte fra om ${categoryPhrase(mainCategory)}${sted ? ` ${sted}` : ''}.`,
    'Saken din er registrert og vises nå på kartet.',
    `Finns.Fairway samler innmeldinger fra hele landet og sender dem samlet til den som har ansvar for veien: kommunen, fylkeskommunen eller Statens vegvesen. ${place?.kommune ? `Saker fra ${place.kommune} blir sendt sammen` : 'Saker fra samme kommune blir sendt sammen'}, og det kan ta litt tid før saken din går videre.`,
    'Vi gjennomfører ikke tiltak selv, men jo flere som støtter saken, jo sterkere står den. Del den gjerne med naboer og andre som kjenner stedet, og be dem støtte saken.',
    'Er det akutt fare, for eksempel et ødelagt skilt eller et hull i veien, må du også melde det direkte til kommunen.',
  ].join('\n\n');
}
