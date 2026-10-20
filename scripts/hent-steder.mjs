// Builds public/data/steder.json: every primary school (grunnskole) and
// every sports venue (football pitches, sports halls, stadiums, athletics
// tracks, swimming halls, ice rinks) in Norway, with municipality.
//
//   - Schools: Utdanningsdirektoratet's Nasjonalt skoleregister (NSR), one
//     search per county, then each school's details for its coordinates.
//   - Venues: OpenStreetMap via Overpass, one query per county (the national
//     Anleggsregisteret has no open API). Pitches/halls at one site are
//     merged into one venue; ballbinger and golf/tennis/beachvolley etc. are
//     left out; unnamed venues are named after the nearest school.
//   - Municipality names: SSB (Klass 131). Venues get the municipality of the
//     nearest school.
//
// The database imports the published file with places_import() (see README
// "Sparkesykler"). Run:  node scripts/hent-steder.mjs
// Never overwrites the file with an incomplete result.
import fs from 'fs';

const FYLKER = ['03', '11', '15', '18', '31', '32', '33', '34', '39', '40', '42', '46', '50', '55', '56'];
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = { 'User-Agent': 'Finns Fairway (finnsvei.no)' };
const MIN_PITCH_M2 = 1200; // bounding box; smaller is a ballbinge / løkke
const MERGE_M = 130;
const SKIP_SPORTS = /golf|tennis|beachvolleyball|equestrian|skateboard|table_tennis|shooting|motor|boules|padel|bowling|disc_golf/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Optional cache of raw source answers (CACHE_DIR=/some/dir) so a rerun after
// a processing fix doesn't hit the servers again.
const CACHE_DIR = process.env.CACHE_DIR || null;
if (CACHE_DIR) fs.mkdirSync(CACHE_DIR, { recursive: true });
const cached = async (key, fn) => {
  if (!CACHE_DIR) return fn();
  const f = `${CACHE_DIR}/${key}.json`;
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fn();
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
};

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => {
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const bboxArea = (b) => (b ? Math.abs(toRad(b.maxlat - b.minlat) * R * toRad(b.maxlon - b.minlon) * R * Math.cos(toRad((b.maxlat + b.minlat) / 2))) : null);

async function json(url, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } });
      if (r.ok) return r.json();
    } catch (_e) { /* retry */ }
    await sleep(1000 * (i + 1));
  }
  throw new Error(`Fikk ikke svar fra ${url}`);
}

// ---- Municipalities (SSB) ----
const ssb = await json('https://data.ssb.no/api/klass/v1/classifications/131/codes?from=2026-01-01', { headers: { Accept: 'application/json' } });
const kommuner = Object.fromEntries(ssb.codes.filter((c) => !c.code.endsWith('99')).map((c) => [c.code, c.name.split(' - ')[0].trim()]));
console.log(`${Object.keys(kommuner).length} kommuner`);

// ---- Schools (NSR) ----
const listed = [];
for (const fylke of FYLKER) {
  const d = await json('https://data-nsr.udir.no/v4/enheter/sok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Fylkesnummer: fylke, InkluderSkoler: true, InkluderAktive: true }) });
  const g = (d.EnhetListe || []).filter((x) => x.ErAktiv && x.ErSkole && x.ErGrunnskole && !/voksenoppl/i.test(x.Navn || ''));
  listed.push(...g);
}
console.log(`${listed.length} aktive grunnskoler, henter koordinater …`);
const schools = [];
let next = 0;
async function worker() {
  while (next < listed.length) {
    const s = listed[next++];
    try {
      const d = await cached(`nsr-${s.Organisasjonsnummer}`, () => json(`https://data-nsr.udir.no/v3/enhet/${s.Organisasjonsnummer}`));
      const lat = Number(d?.Koordinat?.Breddegrad); const lng = Number(d?.Koordinat?.Lengdegrad);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 57 && lat < 72) {
        schools.push({ id: `nsr:${s.Organisasjonsnummer}`, kind: 'skole', type: 'skole', name: d.Navn || s.Navn, kommune: s.Kommunenummer, lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), students: Number(d.Elevtall) || null });
      }
    } catch (_e) { /* skip one school rather than fail all */ }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`${schools.length} skoler med koordinater`);
if (schools.length < listed.length * 0.9) throw new Error('For mange skoler mangler – avbryter uten å lagre');

// ---- Venues (OpenStreetMap) ----
const query = (fylke) => `[out:json][timeout:120];
area["ISO3166-2"="NO-${fylke}"]["admin_level"="4"]->.f;
(
  nwr["leisure"="pitch"]["sport"~"soccer|football|multi|athletics|handball|floorball"](area.f);
  nwr["leisure"~"^(sports_centre|sports_hall|stadium|track|ice_rink)$"](area.f);
);
out bb tags;`;
async function overpass(fylke) {
  for (let round = 0; round < 6; round += 1) {
    for (const url of OVERPASS) {
      try {
        const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query(fylke) }), headers: UA });
        if (r.ok) {
          const d = await r.json();
          if (!d.remark && (d.elements || []).length > 10) return d.elements;
        }
      } catch (_e) { /* next mirror */ }
    }
    await sleep(15000 * (round + 1));
  }
  throw new Error(`Overpass svarte ikke for fylke ${fylke} – avbryter uten å lagre`);
}
const raw = [];
for (const fylke of FYLKER) {
  const els = await cached(`osm-${fylke}`, () => overpass(fylke));
  console.log(`fylke ${fylke}: ${els.length} OSM-objekter`);
  for (const e of els) {
    const t = e.tags || {};
    const sport = String(t.sport || '');
    if (SKIP_SPORTS.test(sport) && !/soccer|football|swimming|multi/.test(sport)) continue;
    // `out bb` gives ways/relations a bounding box and no center (Overpass
    // has one geometry mode per output) — use the box's middle.
    const b = e.bounds;
    const lat = e.lat ?? e.center?.lat ?? (b ? (b.minlat + b.maxlat) / 2 : NaN);
    const lng = e.lon ?? e.center?.lon ?? (b ? (b.minlon + b.maxlon) / 2 : NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const isHall = ['sports_centre', 'sports_hall', 'ice_rink'].includes(t.leisure);
    const a = bboxArea(e.bounds);
    if (t.leisure === 'pitch' && a != null && a < MIN_PITCH_M2) continue;
    raw.push({ osm: `${e.type[0]}${e.id}`, lat, lng, name: t.name || null, hall: isHall, weight: isHall || t.leisure === 'stadium' ? 2 : (t.name ? 1 : 0) });
  }
  await sleep(3000);
}

// Merge a site's pitches and halls into one venue (grid buckets keep it fast).
raw.sort((a, b) => b.weight - a.weight);
const grid = new Map();
const cell = (p) => `${Math.floor(p.lat / 0.002)},${Math.floor(p.lng / 0.004)}`;
const venues = [];
for (const it of raw) {
  const [cy, cx] = cell(it).split(',').map(Number);
  let hit = null;
  for (let dy = -1; dy <= 1 && !hit; dy += 1) for (let dx = -1; dx <= 1 && !hit; dx += 1) {
    for (const v of grid.get(`${cy + dy},${cx + dx}`) || []) if (dist(v, it) < MERGE_M) { hit = v; break; }
  }
  if (hit) { hit.hall ||= it.hall; hit.pitch ||= !it.hall; if (!hit.name && it.name) hit.name = it.name; continue; }
  const v = { id: `osm:${it.osm}`, lat: it.lat, lng: it.lng, name: it.name, hall: it.hall, pitch: !it.hall };
  venues.push(v);
  const k = cell(v); grid.set(k, [...(grid.get(k) || []), v]);
}

// Municipality + names from the nearest school.
const sGrid = new Map();
const sCell = (p) => `${Math.floor(p.lat / 0.05)},${Math.floor(p.lng / 0.1)}`;
for (const s of schools) { const k = sCell(s); sGrid.set(k, [...(sGrid.get(k) || []), s]); }
function nearestSchool(p) {
  for (let ring = 1; ring <= 12; ring += 1) {
    const [cy, cx] = sCell(p).split(',').map(Number);
    let best = null;
    for (let dy = -ring; dy <= ring; dy += 1) for (let dx = -ring; dx <= ring; dx += 1) {
      for (const s of sGrid.get(`${cy + dy},${cx + dx}`) || []) { const d = dist(s, p); if (!best || d < best.d) best = { s, d }; }
    }
    if (best) return best;
  }
  return null;
}
const places = [...schools];
for (const v of venues) {
  const near = nearestSchool(v);
  let name = v.name;
  if (!name) name = near && near.d < 250 ? `${v.hall ? 'Hall' : 'Bane'} ved ${near.s.name}` : `${v.hall ? 'Idrettshall' : 'Fotballbane'}${near ? ` nær ${near.s.name}` : ''}`;
  places.push({ id: v.id, kind: 'anlegg', type: v.hall ? 'hall' : 'bane', name, kommune: near?.s.kommune || null, lat: Number(v.lat.toFixed(5)), lng: Number(v.lng.toFixed(5)), ...(v.name ? {} : { unnamed: true }) });
}

const out = { fetched: new Date().toISOString().slice(0, 10), sources: ['Utdanningsdirektoratet, Nasjonalt skoleregister', 'OpenStreetMap-bidragsytere (ODbL)', 'SSB Klass 131'], kommuner, places };
fs.mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../public/data/steder.json', import.meta.url), JSON.stringify(out));
console.log(`Lagret ${schools.length} skoler og ${venues.length} anlegg (${venues.filter((v) => !v.name).length} uten navn i OSM) i public/data/steder.json`);
