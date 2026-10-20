// Refreshes data/idrettsanlegg.json: football pitches, sports halls,
// stadiums, athletics tracks and swimming halls in a municipality, from
// OpenStreetMap (Overpass). The national Anleggsregisteret has no open API.
// Pitches at one site are merged into one venue; tiny pitches (ballbinger)
// and non-relevant sports (golf, tennis, beachvolley …) are left out.
// Unnamed venues are named after the nearest school or street.
//   node scripts/hent-anlegg.mjs 4204   (4204 = Kristiansand)
import fs from 'fs';

const kommune = process.argv[2] || '4204';
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const QUERY = `[out:json][timeout:90];
area["ref"="${kommune}"]["admin_level"="7"]->.k;
(
  nwr["leisure"="pitch"]["sport"~"soccer|football|multi|athletics|handball|floorball"](area.k);
  nwr["leisure"~"^(sports_centre|sports_hall|stadium|track|ice_rink)$"](area.k);
  nwr["leisure"="sports_centre"]["sport"~"swimming"](area.k);
);
out center bb tags;`;

const MIN_PITCH_M2 = 1200; // bounding box; smaller is a ballbinge / løkke
const MERGE_M = 130;
const SKIP_SPORTS = /golf|tennis|beachvolleyball|equestrian|skateboard|table_tennis|shooting|motor|boules|padel/;

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => {
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// Bounding-box area (Overpass `bb`) — enough to tell a ballbinge from a pitch.
function areaM2(b) {
  if (!b) return null;
  const h = toRad(b.maxlat - b.minlat) * R;
  const w = toRad(b.maxlon - b.minlon) * R * Math.cos(toRad((b.maxlat + b.minlat) / 2));
  return Math.abs(h * w);
}

async function overpass() {
  for (let round = 0; round < 4; round += 1) {
    for (const url of MIRRORS) {
      try {
        const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: QUERY }), headers: { 'User-Agent': 'Finns Fairway (finnsvei.no)' } });
        if (r.ok) {
          const els = (await r.json()).elements || [];
          if (els.length > 20) return els; // an empty/short answer is a server-side timeout, not "no venues"
          console.warn(url, 'tomt svar');
        } else console.warn(url, r.status);
      } catch (e) { console.warn(url, e.message); }
    }
    await new Promise((res) => setTimeout(res, 20000 * (round + 1)));
  }
  throw new Error('Ingen Overpass-server svarte – lista er ikke endret');
}

const elements = await overpass();
const items = [];
for (const e of elements) {
  const t = e.tags || {};
  const sport = String(t.sport || '');
  if (SKIP_SPORTS.test(sport) && !/soccer|football|swimming|multi/.test(sport)) continue;
  const lat = e.center?.lat ?? e.lat; const lng = e.center?.lon ?? e.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  const leisure = t.leisure;
  const isHall = leisure === 'sports_centre' || leisure === 'sports_hall' || leisure === 'ice_rink' || t.building === 'sports_hall' || t.building === 'sports_centre';
  const a = areaM2(e.bounds);
  if (leisure === 'pitch' && a != null && a < MIN_PITCH_M2) continue;
  items.push({ lat, lng, name: t.name || null, type: isHall ? 'hall' : 'bane', leisure, sport, weight: isHall || leisure === 'stadium' ? 2 : (t.name ? 1 : 0) });
}

// Merge everything within MERGE_M of a site into that site.
items.sort((a, b) => b.weight - a.weight);
const venues = [];
for (const it of items) {
  const v = venues.find((x) => dist(x, it) < MERGE_M);
  if (v) {
    v.members += 1;
    if (!v.name && it.name) v.name = it.name;
    if (it.type === 'hall') v.hasHall = true; else v.hasPitch = true;
    continue;
  }
  venues.push({ lat: it.lat, lng: it.lng, name: it.name, members: 1, hasHall: it.type === 'hall', hasPitch: it.type !== 'hall' });
}

const skoler = JSON.parse(fs.readFileSync(new URL('../lib/skoler.json', import.meta.url))).schools;
const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
async function street(v) {
  if (!token) return null;
  try {
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${v.lng},${v.lat}.json?access_token=${token}&language=no&limit=1&types=address,neighborhood,locality`);
    const f = (await r.json())?.features?.[0];
    return f?.text || null;
  } catch (_e) { return null; }
}
for (const v of venues) {
  if (v.name) continue;
  const school = skoler.map((s) => ({ s, d: dist(s, v) })).sort((a, b) => a.d - b.d)[0];
  if (school && school.d < 250) v.name = `${v.hasHall ? 'Hall' : 'Bane'} ved ${school.s.name}`;
  else {
    const st = await street(v);
    v.name = `${v.hasHall ? 'Idrettshall' : 'Fotballbane'}${st ? `, ${st}` : ''}`;
  }
  v.unnamed = true;
}

const out = venues
  .map((v) => ({ name: v.name, type: v.hasHall ? 'hall' : 'bane', lat: Number(v.lat.toFixed(5)), lng: Number(v.lng.toFixed(5)), ...(v.unnamed ? { unnamed: true } : {}) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
fs.writeFileSync(new URL('../data/idrettsanlegg.json', import.meta.url), `${JSON.stringify({ kommune, source: 'OpenStreetMap-bidragsytere (ODbL), via Overpass', fetched: new Date().toISOString().slice(0, 10), venues: out }, null, 1)}\n`);
console.log(`${out.length} anlegg (${out.filter((v) => v.type === 'hall').length} med hall, ${out.filter((v) => v.unnamed).length} uten navn i OSM) lagret i data/idrettsanlegg.json`);
