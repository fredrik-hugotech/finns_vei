#!/usr/bin/env node
// Generates a rich, road-following demo dataset of children's trips to
// football pitches and sports halls across Kristiansand, for the DEMO
// competition shown on /demo. Run by .github/workflows/demo-routes.yml (the
// dev sandbox can't reach Mapbox) — output goes to data/demo-routes.json and
// is imported into Supabase by /api/demo/import.
//
// Nothing here is real data: every origin is a random point in a residential
// area near a real club venue, routed with Mapbox Directions (cycling or
// walking profile). Clubs and venues are real grassroots football/handball
// clubs in Kristiansand kommune; coordinates are approximate — routing snaps
// them to the nearest road anyway.
import { writeFileSync, mkdirSync } from 'node:fs';

const SITE = process.env.SITE_URL || 'https://finnsvei.no';
const OUT = process.env.OUT || 'data/demo-routes.json';
const CONCURRENCY = 4;
const PACE_MS = 90;

// Residential areas (origins). Jitter radius in metres.
const HOODS = {
  'Vågsbygd senter': [58.1355, 7.9645, 500],
  Fiskå: [58.1240, 7.9700, 450],
  Kjos: [58.1400, 7.9560, 400],
  Augland: [58.1315, 7.9430, 450],
  Voiebyen: [58.1185, 7.9520, 500],
  Slettheia: [58.1470, 7.9620, 450],
  Hellemyr: [58.1600, 7.9500, 500],
  Tinnheia: [58.1620, 7.9760, 450],
  Grim: [58.1620, 7.9870, 450],
  Eg: [58.1700, 7.9950, 350],
  Kvadraturen: [58.1470, 8.0040, 450],
  Lund: [58.1490, 8.0150, 500],
  Kongsgård: [58.1530, 8.0260, 400],
  Gimlekollen: [58.1650, 8.0350, 500],
  Justneshalvøya: [58.1760, 8.0450, 500],
  Justvik: [58.1900, 8.0500, 450],
  Ålefjær: [58.2030, 8.0530, 400],
  Hånes: [58.1720, 8.0790, 500],
  Lauvåsen: [58.1790, 8.0700, 400],
  Vigvoll: [58.1700, 8.0650, 400],
  Søm: [58.1560, 8.0790, 500],
  Strømme: [58.1520, 8.0700, 450],
  Rona: [58.1485, 8.0630, 400],
  Dvergsnes: [58.1665, 8.0930, 500],
  'Flekkerøy Mæbø': [58.0780, 8.0030, 400],
  Kjære: [58.0690, 7.9930, 400],
  Andås: [58.0760, 7.9890, 350],
  Skålevik: [58.0640, 8.0060, 350],
  Mosby: [58.2240, 7.9760, 500],
  Strai: [58.2020, 7.9700, 450],
  Kjerrane: [58.2380, 7.9750, 400],
  Ryen: [58.2120, 8.1450, 450],
  Drangsholt: [58.2200, 8.1570, 400],
  Hamresanden: [58.2000, 8.1030, 450],
  Tangvall: [58.0900, 7.8000, 450],
  Lunde: [58.0820, 7.8100, 450],
  Langenes: [58.0700, 7.8000, 450],
  Høllen: [58.0800, 7.7860, 400],
  Nodeland: [58.1680, 7.8350, 450],
  Brennåsen: [58.1640, 7.8600, 450],
  Kilen: [58.1610, 7.8300, 350],
};

// Venues: football pitches and sports halls.
const VENUES = {
  'Karuss stadion': [58.1282, 7.9575],
  Vågsbygdhallen: [58.1290, 7.9705],
  'Flekkerøy stadion': [58.0730, 7.9990],
  Flekkerøyhallen: [58.0735, 7.9985],
  'Randesund idrettspark': [58.1616, 8.0868],
  'Randesund idrettshall': [58.1580, 8.0785],
  'Hånes idrettsplass': [58.1745, 8.0765],
  Håneshallen: [58.1745, 8.0770],
  'Vigør stadion': [58.1540, 8.0255],
  'Kristiansand stadion': [58.1566, 8.0019],
  Gimlehallen: [58.1612, 8.0290],
  'Gimletroll idrettspark': [58.1660, 8.0340],
  'Justvik idrettsplass': [58.1895, 8.0505],
  Justvikhallen: [58.1898, 8.0510],
  'Torridal idrettsplass': [58.2265, 7.9725],
  Torridalhallen: [58.2262, 7.9740],
  'Tveit idrettsplass': [58.2110, 8.1440],
  Tveithallen: [58.2115, 8.1435],
  'Hellemyr idrettsplass': [58.1585, 7.9525],
  'Søgne idrettspark': [58.0885, 7.7965],
  Søgnehallen: [58.0880, 7.7990],
  'Greipstad idrettspark': [58.1670, 7.8320],
  Songdalshallen: [58.1665, 7.8340],
  'Idda Arena': [58.1447, 7.9897],
  Aquarama: [58.1430, 8.0036],
};

// Real grassroots clubs in Kristiansand kommune. `trips` ≈ how many trips to
// generate (size of the club's youth section, roughly).
const CLUBS = [
  { name: 'Vågsbygd IL', sport: 'fotball', venues: ['Karuss stadion'], hoods: ['Vågsbygd senter', 'Fiskå', 'Kjos', 'Augland', 'Voiebyen', 'Slettheia'], trips: 60 },
  { name: 'Vågsbygd IL', sport: 'håndball', venues: ['Vågsbygdhallen'], hoods: ['Vågsbygd senter', 'Fiskå', 'Kjos', 'Augland', 'Voiebyen'], trips: 40 },
  { name: 'Fløy', sport: 'fotball', venues: ['Flekkerøy stadion'], hoods: ['Flekkerøy Mæbø', 'Kjære', 'Andås', 'Skålevik'], trips: 45 },
  { name: 'Fløy', sport: 'håndball', venues: ['Flekkerøyhallen'], hoods: ['Flekkerøy Mæbø', 'Kjære', 'Andås', 'Skålevik'], trips: 22 },
  { name: 'Randesund IL', sport: 'fotball', venues: ['Randesund idrettspark'], hoods: ['Søm', 'Strømme', 'Dvergsnes', 'Rona', 'Hånes'], trips: 60 },
  { name: 'Randesund IL', sport: 'håndball', venues: ['Randesund idrettshall'], hoods: ['Søm', 'Strømme', 'Dvergsnes', 'Rona'], trips: 50 },
  { name: 'Hånes IF', sport: 'fotball', venues: ['Hånes idrettsplass'], hoods: ['Hånes', 'Vigvoll', 'Lauvåsen'], trips: 30 },
  { name: 'Hånes IF', sport: 'håndball', venues: ['Håneshallen'], hoods: ['Hånes', 'Vigvoll', 'Lauvåsen'], trips: 18 },
  { name: 'FK Vigør', sport: 'fotball', venues: ['Vigør stadion'], hoods: ['Kongsgård', 'Lund', 'Gimlekollen', 'Justneshalvøya'], trips: 50 },
  { name: 'Donn', sport: 'fotball', venues: ['Kristiansand stadion'], hoods: ['Lund', 'Eg', 'Grim', 'Kvadraturen'], trips: 50 },
  { name: 'KIF', sport: 'fotball', venues: ['Kristiansand stadion'], hoods: ['Grim', 'Tinnheia', 'Hellemyr', 'Kvadraturen'], trips: 35 },
  { name: 'KIF', sport: 'håndball', venues: ['Gimlehallen'], hoods: ['Lund', 'Grim', 'Kongsgård', 'Kvadraturen'], trips: 35 },
  { name: 'Gimletroll', sport: 'fotball', venues: ['Gimletroll idrettspark'], hoods: ['Gimlekollen', 'Justneshalvøya', 'Lund'], trips: 35 },
  { name: 'Gimletroll', sport: 'håndball', venues: ['Gimlehallen'], hoods: ['Gimlekollen', 'Lund', 'Kongsgård'], trips: 30 },
  { name: 'AK28', sport: 'håndball', venues: ['Idda Arena', 'Aquarama'], hoods: ['Grim', 'Kvadraturen', 'Lund', 'Tinnheia', 'Eg'], trips: 45 },
  { name: 'Justvik IL', sport: 'fotball', venues: ['Justvik idrettsplass'], hoods: ['Justvik', 'Justneshalvøya', 'Ålefjær'], trips: 28 },
  { name: 'Justvik IL', sport: 'håndball', venues: ['Justvikhallen'], hoods: ['Justvik', 'Justneshalvøya', 'Ålefjær'], trips: 18 },
  { name: 'Torridal IL', sport: 'fotball', venues: ['Torridal idrettsplass'], hoods: ['Mosby', 'Strai', 'Kjerrane'], trips: 35 },
  { name: 'Torridal IL', sport: 'håndball', venues: ['Torridalhallen'], hoods: ['Mosby', 'Strai', 'Kjerrane'], trips: 25 },
  { name: 'Tveit IL', sport: 'fotball', venues: ['Tveit idrettsplass'], hoods: ['Ryen', 'Drangsholt', 'Hamresanden'], trips: 28 },
  { name: 'Tveit IL', sport: 'håndball', venues: ['Tveithallen'], hoods: ['Ryen', 'Drangsholt', 'Hamresanden'], trips: 18 },
  { name: 'Hellemyr IL', sport: 'fotball', venues: ['Hellemyr idrettsplass'], hoods: ['Hellemyr', 'Tinnheia', 'Slettheia'], trips: 30 },
  { name: 'Søgne FK', sport: 'fotball', venues: ['Søgne idrettspark'], hoods: ['Tangvall', 'Lunde', 'Langenes', 'Høllen'], trips: 45 },
  { name: 'Søgne HK', sport: 'håndball', venues: ['Søgnehallen'], hoods: ['Tangvall', 'Lunde', 'Langenes', 'Høllen'], trips: 30 },
  { name: 'Greipstad IL', sport: 'fotball', venues: ['Greipstad idrettspark'], hoods: ['Nodeland', 'Brennåsen', 'Kilen'], trips: 30 },
  { name: 'Greipstad IL', sport: 'håndball', venues: ['Songdalshallen'], hoods: ['Nodeland', 'Brennåsen', 'Kilen'], trips: 20 },
];

// ---------------------------------------------------------------------------
// Real coordinates from Kartverket (Sentralt stedsnavnregister). The hand-typed
// coordinates in VENUES/HOODS are only a last-resort fallback: we list every
// sports facility / hall / neighbourhood in Kristiansand kommune (4204) and
// match by name, then fall back to a name search, then to the school of the
// same name (pitches usually sit next to the school), then to the fallback.
const KOMMUNE = '4204';
const KV = 'https://ws.geonorge.no/stedsnavn/v1';
const KV_UA = 'FinnsFairway/1.0 (https://finnsvei.no; fredrik@hugo.as)';
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-zæøå0-9]+/g, ' ').trim();
// Kartverket's kommune filter is not reliably honoured, so every candidate is
// also checked against a bounding box around Kristiansand kommune.
const BOX = { minLat: 57.98, maxLat: 58.36, minLng: 7.62, maxLng: 8.32 };
const inBox = (e) => e && e.lat >= BOX.minLat && e.lat <= BOX.maxLat && e.lng >= BOX.minLng && e.lng <= BOX.maxLng;

function kvEntries(json) {
  const out = [];
  for (const n of json?.navn || []) {
    const names = [];
    if (n?.skrivemåte) names.push(n.skrivemåte);
    for (const sn of n?.stedsnavn || []) if (sn?.skrivemåte) names.push(sn.skrivemåte);
    const rp = n?.representasjonspunkt || {};
    const lng = Number(rp.øst ?? rp.lon); const lat = Number(rp.nord ?? rp.lat);
    if (!names.length || !Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const kommune = (n?.kommuner || []).map((k) => String(k?.kommunenummer || ''));
    const e = { names, type: n?.navneobjekttype || '', lat, lng, kommune };
    if (inBox(e) || kommune.includes(KOMMUNE)) out.push(e);
  }
  return out;
}
async function kvList(type) {
  const url = `${KV}/sted?kommunenummer=${KOMMUNE}&navneobjekttype=${encodeURIComponent(type)}&utkoordsys=4258&treffPerSide=500&side=1`;
  try { const r = await fetch(url, { headers: { 'User-Agent': KV_UA, Accept: 'application/json' } }); return r.ok ? kvEntries(await r.json()) : []; } catch (_e) { return []; }
}
async function kvSearch(q, types) {
  const url = `${KV}/navn?sok=${encodeURIComponent(q + '*')}&kommunenummer=${KOMMUNE}&fuzzy=true&utkoordsys=4258&treffPerSide=20&side=1`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': KV_UA, Accept: 'application/json' } });
    if (!r.ok) return null;
    const list = kvEntries(await r.json());
    return list.find((e) => types.includes(e.type) && e.names.some((n) => norm(n).startsWith(norm(q))))
      || list.find((e) => types.includes(e.type)) || null;
  } catch (_e) { return null; }
}
async function mbSearch(token, q) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
    + `?access_token=${token}&country=no&language=no&limit=5&types=poi`
    + `&bbox=${BOX.minLng},${BOX.minLat},${BOX.maxLng},${BOX.maxLat}&proximity=8.0,58.15`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const feats = (await r.json()).features || [];
    const nq = norm(q);
    const f = feats.find((x) => norm(x.text).includes(nq) || nq.includes(norm(x.text)))
      || feats.find((x) => /stadium|pitch|sports|arena|gym|idrett|hall/i.test(`${x.properties?.category || ''} ${x.text || ''}`));
    if (!f || !Array.isArray(f.center)) return null;
    const e = { names: [f.text || q], type: `Mapbox ${f.properties?.category || 'poi'}`, lng: Number(f.center[0]), lat: Number(f.center[1]) };
    return inBox(e) ? e : null;
  } catch (_e) { return null; }
}

function findIn(list, aliases) {
  for (const a of aliases) {
    const na = norm(a);
    const hit = list.find((e) => e.names.some((n) => norm(n) === na)) || list.find((e) => e.names.some((n) => norm(n).includes(na)));
    if (hit) return hit;
  }
  return null;
}
const VENUE_TYPES = ['Idrettsanlegg', 'Idrettshall', 'Stadion', 'Svømmehall', 'Idrettsplass'];
const HOOD_TYPES = ['Bydel', 'Tettbebyggelse', 'Boligfelt', 'Tettsted', 'Grend', 'Tettsteddel', 'Bebyggelse'];
const VENUE_ALIASES = {
  'Karuss stadion': ['Karuss stadion', 'Karuss idrettspark', 'Karuss kunstgress', 'Karuss'],
  'Flekkerøy stadion': ['Flekkerøy stadion', 'Flekkerøy idrettspark', 'Fløy stadion', 'Flekkerøy'],
  'Randesund idrettspark': ['Randesund idrettspark', 'Dvergsnes idrettspark', 'Dvergsnes kunstgress', 'Randesund stadion', 'Dvergsnes'],
  'Randesund idrettshall': ['Randesundhallen', 'Randesund idrettshall', 'Dvergsneshallen', 'Strømmehallen', 'Sømhallen'],
  'Hånes idrettsplass': ['Hånes idrettsplass', 'Hånes stadion', 'Hånes kunstgress', 'Hånes'],
  Håneshallen: ['Håneshallen', 'Hånes idrettshall', 'Hånes'],
  'Vigør stadion': ['Vigør stadion', 'Kongsgård idrettspark', 'Vigørbanen', 'Kongsgård'],
  'Kristiansand stadion': ['Kristiansand stadion', 'Kristiansand Stadion'],
  Gimlehallen: ['Gimlehallen', 'Gimle idrettshall'],
  'Gimletroll idrettspark': ['Gimletroll idrettspark', 'Gimlekollen idrettspark', 'Gimletroll', 'Gimlekollen kunstgress', 'Gimlekollen'],
  'Justvik idrettsplass': ['Justvik idrettsplass', 'Justvik stadion', 'Justvik kunstgress', 'Justvik'],
  Justvikhallen: ['Justvikhallen', 'Justvik idrettshall', 'Justvik'],
  'Torridal idrettsplass': ['Torridal idrettsplass', 'Mosby idrettsplass', 'Torridal stadion', 'Mosby'],
  Torridalhallen: ['Torridalhallen', 'Torridal idrettshall', 'Mosbyhallen', 'Mosby'],
  'Tveit idrettsplass': ['Tveit idrettsplass', 'Tveit stadion', 'Ryen idrettsplass', 'Tveit'],
  Tveithallen: ['Tveithallen', 'Tveit idrettshall', 'Tveit'],
  'Hellemyr idrettsplass': ['Hellemyr idrettsplass', 'Hellemyr kunstgress', 'Hellemyr stadion', 'Hellemyr'],
  'Søgne idrettspark': ['Søgne idrettspark', 'Søgne stadion', 'Tangvall idrettspark', 'Tangvall stadion', 'Tangvall'],
  Søgnehallen: ['Søgnehallen', 'Søgne idrettshall', 'Tangvallhallen', 'Søgne'],
  'Greipstad idrettspark': ['Greipstad idrettspark', 'Nodeland idrettspark', 'Greipstad stadion', 'Nodeland'],
  Songdalshallen: ['Songdalshallen', 'Songdalen idrettshall', 'Nodelandshallen', 'Nodeland'],
  'Idda Arena': ['Idda Arena', 'Idda'],
  Aquarama: ['Aquarama', 'Aquarama Kristiansand'],
  Vågsbygdhallen: ['Vågsbygdhallen', 'Vågsbygd idrettshall'],
  Flekkerøyhallen: ['Flekkerøyhallen', 'Flekkerøy idrettshall', 'Flekkerøy'],
};

async function resolvePlaces(token) {
  const venueList = (await Promise.all(VENUE_TYPES.map(kvList))).flat();
  const hoodList = (await Promise.all(HOOD_TYPES.map(kvList))).flat();
  const schoolList = await kvList('Skole');
  console.log(`Kartverket: ${venueList.length} anlegg/haller, ${hoodList.length} bydeler/boligfelt, ${schoolList.length} skoler i kommune ${KOMMUNE}`);
  const venues = [];
  for (const [name, fallback] of Object.entries(VENUES)) {
    const aliases = VENUE_ALIASES[name] || [name];
    let hit = findIn(venueList, aliases);
    let how = 'liste';
    if (!hit) { hit = await kvSearch(aliases[0], VENUE_TYPES); how = 'søk'; }
    if (!hit) {
      for (const a of aliases) { hit = await mbSearch(token, a); if (hit) { how = 'Mapbox POI'; break; } }
    }
    if (!hit) { hit = findIn(schoolList, aliases.map((a) => a.replace(/ (stadion|idrettspark|idrettsplass|idrettshall|hallen)$/i, '') + ' skole')); how = 'skole ved siden av'; }
    if (!hit) { hit = { lat: fallback[0], lng: fallback[1], names: [name], type: '?' }; how = 'FALLBACK (håndskrevet)'; }
    const type = /hall|arena|aquarama/i.test(name) ? 'hall' : 'bane';
    venues.push({ name, type, lat: Number(hit.lat.toFixed(5)), lng: Number(hit.lng.toFixed(5)) });
    VENUES[name] = [hit.lat, hit.lng];
    console.log(`  anlegg ${name.padEnd(24)} -> ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}  [${how}: ${hit.names[0]} / ${hit.type}]`);
  }
  for (const [name, [flat, flng, r]] of Object.entries(HOODS)) {
    const base = name.replace(/^Flekkerøy /, '').replace(/ senter$/, '');
    let hit = findIn(hoodList, [name, base]);
    let how = 'liste';
    if (!hit) { hit = await kvSearch(base, HOOD_TYPES); how = 'søk'; }
    if (!hit) { hit = { lat: flat, lng: flng, names: [name], type: '?' }; how = 'FALLBACK (håndskrevet)'; }
    HOODS[name] = [hit.lat, hit.lng, r];
    console.log(`  område ${name.padEnd(24)} -> ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}  [${how}: ${hit.names[0]} / ${hit.type}]`);
  }
  return venues;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1], centre-heavy

function offset([lat, lng], meters, bearingRad) {
  const dLat = (meters * Math.cos(bearingRad)) / 111320;
  const dLng = (meters * Math.sin(bearingRad)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}
function distM(a, b) {
  const R = 6371000, tr = (d) => (d * Math.PI) / 180;
  const dLa = tr(b[0] - a[0]), dLo = tr(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(tr(a[0])) * Math.cos(tr(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The public Mapbox token is inlined in the site's JS bundle — read it from
// there so the workflow needs no secrets at all.
async function findToken() {
  if (process.env.MAPBOX_TOKEN) return process.env.MAPBOX_TOKEN;
  const re = /pk\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/;
  const abs = (u) => (u.startsWith('http') ? u : `${SITE}${u.startsWith('/') ? '' : '/'}${u}`);
  const seen = new Set();
  const queue = [];
  const html = await (await fetch(SITE)).text();
  for (const m of html.matchAll(/src="([^"]+\.js[^"]*)"/g)) queue.push(m[1]);
  // Turbopack loads page chunks through the build manifest rather than
  // <script src> tags — pull every chunk path it references too.
  const manifest = queue.find((u) => u.includes('_buildManifest'));
  if (manifest) {
    const txt = await (await fetch(abs(manifest))).text();
    for (const m of txt.matchAll(/"(static\/[^"]+\.js)"/g)) queue.push(`/_next/${m[1]}`);
  }
  for (const src of queue) {
    const url = abs(src);
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const js = await (await fetch(url)).text();
      const m = js.match(re);
      if (m) return m[0];
      // Chunks can import further chunks; follow one level of those too.
      for (const c of js.matchAll(/"(static\/immutable\/chunks\/[^"]+\.js)"/g)) {
        const cu = abs(`/_next/${c[1]}`);
        if (!seen.has(cu)) queue.push(cu);
      }
    } catch (_e) { /* skip */ }
  }
  throw new Error(`Fant ikke Mapbox-token i ${seen.size} bundle-filer — sett MAPBOX_TOKEN.`);
}

async function route(token, profile, from, to) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${from[1]},${from[0]};${to[1]},${to[0]}`
    + `?geometries=geojson&overview=full&radiuses=300;300&access_token=${token}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url);
    if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (!r.ok) return null;
    const j = await r.json();
    const rt = j.routes?.[0];
    if (!rt) return null;
    return { coords: rt.geometry.coordinates.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]), distanceM: Math.round(rt.distance), durationS: Math.round(rt.duration) };
  }
  return null;
}

// Plausible metadata: when trips happen, helmet share, weather.
const FIRST_DAY = new Date('2026-09-01T00:00:00+02:00');
const DAYS = 17;
function makeTimestamp() {
  const day = Math.floor(Math.random() * DAYS);
  const d = new Date(FIRST_DAY.getTime() + day * 86400000);
  const dow = d.getDay();
  let hour;
  if (dow === 0 || dow === 6) hour = rnd(9.5, 15); // helg: kamper/cuper
  else hour = Math.random() < 0.88 ? rnd(16, 19.5) : rnd(14.5, 16); // trening
  d.setTime(d.getTime() + hour * 3600000);
  return d.toISOString();
}
function makeWeather() {
  const r = Math.random();
  if (r < 0.14) return { symbol: 'rain', precipMm: Number(rnd(0.5, 3.2).toFixed(1)), tempC: Number(rnd(9, 14).toFixed(1)) };
  if (r < 0.34) return { symbol: 'cloudy', precipMm: 0, tempC: Number(rnd(11, 16).toFixed(1)) };
  if (r < 0.6) return { symbol: 'fair_day', precipMm: 0, tempC: Number(rnd(12, 18).toFixed(1)) };
  return { symbol: 'clearsky_day', precipMm: 0, tempC: Number(rnd(13, 20).toFixed(1)) };
}

async function main() {
  const token = await findToken();
  console.log('Token funnet. Slår opp anlegg og boligområder i Kartverket …');
  const venues = await resolvePlaces(token);
  mkdirSync('data', { recursive: true });
  writeFileSync('data/demo-venues.json', JSON.stringify(venues, null, 1));
  console.log('Genererer …');
  const jobs = [];
  for (const club of CLUBS) {
    for (let i = 0; i < club.trips; i++) {
      const venueName = pick(club.venues);
      const venue = VENUES[venueName];
      let origin;
      if (Math.random() < 0.85) {
        const [lat, lng, r] = HOODS[pick(club.hoods)];
        origin = offset([lat, lng], Math.abs(gauss()) * r * 1.6, rnd(0, Math.PI * 2));
      } else {
        origin = offset(venue, rnd(900, 3800), rnd(0, Math.PI * 2)); // spredt bosetting rundt anlegget
      }
      const straight = distM(origin, venue);
      const walk = straight < 1300 ? Math.random() < 0.45 : Math.random() < 0.1;
      jobs.push({ club: club.name, sport: club.sport, venue: venueName, origin, dest: venue, mode: walk ? 'gange' : 'sykkel' });
    }
  }
  console.log(`${jobs.length} turer å rute`);

  const trips = [];
  let done = 0, failed = 0, next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const res = await route(token, job.mode === 'gange' ? 'walking' : 'cycling', job.origin, job.dest);
        if (res && res.coords.length >= 3 && res.distanceM >= 250 && res.distanceM <= 12000) {
          const speed = job.mode === 'gange' ? rnd(1.15, 1.55) : rnd(3.2, 5.4);
          const w = makeWeather();
          trips.push({
            club: job.club,
            sport: job.sport,
            venue: job.venue,
            mode: job.mode,
            routeType: 'trening',
            helmet: job.mode === 'gange' ? false : Math.random() < 0.84,
            distanceM: res.distanceM,
            durationS: Math.round(res.distanceM / speed),
            createdAt: makeTimestamp(),
            weather: w,
            path: res.coords,
          });
        } else failed++;
      } catch (_e) { failed++; }
      done++;
      if (done % 50 === 0) console.log(`${done}/${jobs.length} (${trips.length} ok, ${failed} hoppet over)`);
      await sleep(PACE_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  trips.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const out = {
    generatedAt: new Date().toISOString(),
    clubs: Object.values(CLUBS.reduce((acc, c) => { acc[c.name] = acc[c.name] ? { name: c.name, sport: 'fotball og håndball' } : { name: c.name, sport: c.sport }; return acc; }, {})),
    trips,
  };
  mkdirSync('data', { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`Skrev ${trips.length} turer til ${OUT} (${failed} hoppet over)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
