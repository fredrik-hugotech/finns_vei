// Kryssingsanalyse: where can children cross the road at a report, and how
// far do they have to walk to a crossing from the places they go to?
//
// 1. The road at the report: the nearest car road in NVDB's road network, and
//    the rest of that road (same road number) within 500 m.
// 2. Crossings on that road: registered crossings (NVDB 174) and crossing
//    links in the road network (often the only trace of municipal crossings).
// 3. Distance along the road to the nearest crossing in each direction, and
//    the gap between them.
// 4. Destinations within reach (bus stops from Entur, schools, kindergartens,
//    sports venues): straight-line distance to the nearest crossing on the road.
const BASE = (process.env.NVDB_BASE_URL || 'https://nvdbapiles.atlas.vegvesen.no').replace(/\/+$/, '');
const NVDB_HEADERS = { Accept: 'application/json', 'X-Client': 'finnsvei' };
const ENTUR = 'https://api.entur.io/geocoder/v1/reverse';

async function getJson(url, headers) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch (_e) { return null; } finally { clearTimeout(t); }
}

// Local planar coordinates in metres around the report point.
function projector(lat0, lng0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180); const ky = 111320;
  return (lat, lng) => ({ x: (lng - lng0) * kx, y: (lat - lat0) * ky });
}

// NVDB WKT in srid 4326 is «lat lng [z]»; returns [{lat, lng}].
function pointsFromWkt(wkt) {
  const s = String(wkt || '');
  const dim = /\bZ\b/i.test(s) ? 3 : 2;
  const nums = (s.replace(/^[A-Z\s]+/i, '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const out = [];
  for (let i = 0; i + 1 < nums.length; i += dim) {
    let a = nums[i]; let b = nums[i + 1];
    if (Math.abs(a) < 40 && Math.abs(b) > 40) [a, b] = [b, a];
    out.push({ lat: a, lng: b });
  }
  return out;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  const x = a.x + t * dx; const y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}
function distToLine(p, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) best = Math.min(best, distToSegment(p, line[i - 1], line[i]));
  return line.length === 1 ? Math.hypot(p.x - line[0].x, p.y - line[0].y) : best;
}
const centroid = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

const CAR_ROAD = /enkel bilveg|kanalisert veg|rundkjøring|rampe|bilferje/i;
const roadNumber = (seg) => String(seg.vegsystemreferanse?.kortform || '').split(' S')[0] || null;

function box(lat, lng, r) {
  const dLat = r / 111320; const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((v) => v.toFixed(6)).join(',');
}

async function roadNetwork(lat, lng, r) {
  const out = [];
  let url = `${BASE}/vegnett/api/v4/veglenkesekvenser/segmentert?srid=4326&antall=1000&kartutsnitt=${box(lat, lng, r)}`;
  for (let page = 0; page < 3 && url; page += 1) {
    const d = await getJson(url, NVDB_HEADERS);
    if (!d) break;
    out.push(...(d.objekter || []));
    url = (d.objekter || []).length >= 1000 ? d.metadata?.neste?.href || null : null;
  }
  return out;
}

export async function crossingAnalysis({ lat, lng, near = {} }) {
  const P = projector(lat, lng);
  const here = { x: 0, y: 0 };
  const [segs, reg, stops] = await Promise.all([
    roadNetwork(lat, lng, 500),
    getJson(`${BASE}/vegobjekter/api/v4/vegobjekter/174?srid=4326&inkluder=geometri&antall=300&kartutsnitt=${box(lat, lng, 500)}`, NVDB_HEADERS),
    getJson(`${ENTUR}?point.lat=${lat}&point.lon=${lng}&boundary.circle.radius=0.3&size=20&layers=venue`, { 'ET-Client-Name': 'finnsfairway-finnsvei' }),
  ]);
  const lines = segs.map((s) => ({ s, type: s.typeVeg || '', ref: roadNumber(s), line: pointsFromWkt(s.geometri?.wkt).map((p) => P(p.lat, p.lng)) })).filter((x) => x.line.length);
  const cars = lines.filter((x) => CAR_ROAD.test(x.type)).map((x) => ({ ...x, d: distToLine(here, x.line) })).sort((a, b) => a.d - b.d);
  const main = cars[0] && cars[0].d <= 60 ? cars[0] : null;
  if (!main) return { road_ref: null, note: 'Fant ingen bilveg innen 60 m', crossings_on_road: 0, destinations: [], flags: [] };
  const road = main.ref ? cars.filter((x) => x.ref === main.ref) : [main];

  // Crossings: registered (174) and road-network crossing links, merged within 15 m.
  const candidates = [];
  for (const o of reg?.objekter || []) {
    const pts = pointsFromWkt(o.geometri?.wkt).map((p) => P(p.lat, p.lng));
    if (pts.length) candidates.push({ ...centroid(pts), src: 'register' });
  }
  for (const x of lines.filter((l) => /gangfelt/i.test(l.type))) candidates.push({ ...centroid(x.line), src: 'vegnett' });
  const crossings = [];
  for (const c of candidates) {
    if (road.every((r) => distToLine(c, r.line) > 25)) continue; // not on this road
    if (crossings.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < 15)) continue;
    crossings.push(c);
  }

  // Direction of the road at the report, from the nearest piece of it.
  let dir = null;
  for (let i = 1; i < main.line.length; i += 1) {
    const a = main.line[i - 1]; const b = main.line[i];
    const d = distToSegment(here, a, b);
    if (!dir || d < dir.d) { const len = Math.hypot(b.x - a.x, b.y - a.y) || 1; dir = { d, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len }; }
  }
  let ahead = null; let behind = null;
  for (const c of crossings) {
    const t = c.x * dir.ux + c.y * dir.uy;
    const dist = Math.hypot(c.x, c.y);
    if (t >= 0) ahead = ahead === null ? dist : Math.min(ahead, dist);
    else behind = behind === null ? dist : Math.min(behind, dist);
  }
  const nearestCrossing = (p) => (crossings.length ? Math.round(Math.min(...crossings.map((c) => Math.hypot(c.x - p.x, c.y - p.y)))) : null);

  // Destinations around the report.
  const dest = [];
  for (const f of stops?.features || []) {
    const cat = (f.properties?.category || []).join(',');
    if (!/bus|tram/i.test(cat)) continue;
    const [lo, la] = f.geometry.coordinates;
    const p = P(la, lo);
    dest.push({ type: 'Bussholdeplass', navn: f.properties.name, m: Math.round(Math.hypot(p.x, p.y)), crossing_m: nearestCrossing(p), road_m: Math.round(Math.min(...road.map((r) => distToLine(p, r.line)))) });
  }
  const add = (type, list, maxM) => {
    for (const x of list || []) {
      if (x.m > maxM || !Number.isFinite(Number(x.lat))) continue;
      const p = P(Number(x.lat), Number(x.lng));
      dest.push({ type, navn: x.navn, m: x.m, crossing_m: nearestCrossing(p), road_m: Math.round(Math.min(...road.map((r) => distToLine(p, r.line)))) });
    }
  };
  add('Skole', near.skoler, 500);
  add('Barnehage', near.barnehager, 300);
  add('Idrettsanlegg', near.anlegg, 300);
  dest.sort((a, b) => a.m - b.m);

  const gap = ahead !== null && behind !== null ? Math.round(ahead + behind) : null;
  const flags = [];
  if (!crossings.length) flags.push(`Ingen gangfelt på ${main.ref || 'vegen'} innen 500 m.`);
  else if (gap !== null && gap > 300) flags.push(`${gap} m mellom gangfeltene rundt stedet.`);
  else if (gap === null) flags.push(`Gangfelt bare i én retning innen 500 m (nærmeste ${Math.round(ahead ?? behind)} m).`);
  for (const d of dest.filter((x) => x.road_m <= 60 && (x.crossing_m === null || x.crossing_m > 150)).slice(0, 4)) {
    flags.push(`${d.type} ${d.navn} ligger ${d.m} m unna${d.crossing_m === null ? ' og har ikke gangfelt på vegen innen 500 m' : `, ${d.crossing_m} m fra nærmeste gangfelt`}.`);
  }
  return {
    road_ref: main.ref,
    road_type: main.type,
    crossings_on_road: crossings.length,
    crossing_ahead_m: ahead !== null ? Math.round(ahead) : null,
    crossing_behind_m: behind !== null ? Math.round(behind) : null,
    crossing_gap_m: gap,
    bus_stops_300m: dest.filter((d) => d.type === 'Bussholdeplass').length,
    destinations: dest.slice(0, 15),
    far_from_crossing: dest.filter((x) => x.road_m <= 60 && (x.crossing_m === null || x.crossing_m > 150)).length,
    flags,
  };
}
