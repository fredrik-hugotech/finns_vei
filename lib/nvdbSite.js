// The road around a point, from NVDB: crossings (174), speed bumps (103),
// street lights (87), traffic volume with share of long vehicles (540) and
// whether there is a sidewalk or a foot/cycle path (road network type).
const BASE = (process.env.NVDB_BASE_URL || 'https://nvdbapiles.atlas.vegvesen.no').replace(/\/+$/, '');
const HEADERS = { Accept: 'application/json', 'X-Client': 'finnsvei' };

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: HEADERS, signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch (_e) { return null; } finally { clearTimeout(t); }
}

function meters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// NVDB writes srid 4326 WKT as «lat lng»; nearest vertex distance (dense enough for 100 m).
function nearestM(wkt, here) {
  const nums = String(wkt || '').replace(/[A-Z]+\s*Z?\s*/gi, ' ').match(/-?\d+(?:\.\d+)?/g) || [];
  const dim = /\bZ\b/i.test(String(wkt)) ? 3 : 2;
  let best = Infinity;
  for (let i = 0; i + 1 < nums.length; i += dim) {
    let a = Number(nums[i]); let b = Number(nums[i + 1]);
    if (Math.abs(a) < 40 && Math.abs(b) > 40) [a, b] = [b, a];
    best = Math.min(best, meters(here, { lat: a, lng: b }));
  }
  return best;
}

function box(lat, lng, r) {
  const dLat = r / 111320; const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((v) => v.toFixed(6)).join(',');
}

async function objectsNear(type, lat, lng, r, extra = '') {
  const d = await getJson(`${BASE}/vegobjekter/api/v4/vegobjekter/${type}?srid=4326&inkluder=geometri${extra}&antall=200&kartutsnitt=${box(lat, lng, r)}`);
  if (!d) return null;
  const here = { lat, lng };
  return (d.objekter || []).map((o) => ({ o, m: nearestM(o.geometri?.wkt, here) })).filter((x) => x.m <= r).sort((a, b) => a.m - b.m);
}

const prop = (o, name) => (o.egenskaper || []).find((e) => e.navn === name)?.verdi;

// v2 (2026-11-19): sidewalks also from the «Fortau» objects (type 48). Many
// sidewalks are registered only as objects, not as their own road links, so
// v1 missed about one in six. Traffic (ÅDT) is kept per road within 150 m, so
// a number can be tied to the road the case is on (see sameRoadTraffic).
export const SITE_VERSION = 2;

// «KV1376 S1D1 m5-196» -> «KV1376».
export const roadKey = (ref) => String(ref || '').trim().split(/\s+/)[0].toUpperCase() || null;

export async function siteNear({ lat, lng }) {
  const here = { lat, lng };
  const [crossings, bumps, lights, traffic, roads, sidewalks] = await Promise.all([
    objectsNear(174, lat, lng, 100),
    objectsNear(103, lat, lng, 150),
    objectsNear(87, lat, lng, 50),
    objectsNear(540, lat, lng, 150, ',egenskaper,lokasjon'),
    getJson(`${BASE}/vegnett/api/v4/veglenkesekvenser/segmentert?srid=4326&antall=100&kartutsnitt=${box(lat, lng, 30)}`),
    objectsNear(48, lat, lng, 30),
  ]);
  const t = traffic?.find((x) => x.m <= 80)?.o;
  const trafficByRoad = [];
  for (const x of traffic || []) {
    const roadsHere = (x.o.lokasjon?.vegsystemreferanser || []).map((v) => roadKey(v.kortform)).filter(Boolean);
    const aadt = prop(x.o, 'ÅDT, total');
    if (aadt == null) continue;
    for (const road of new Set(roadsHere)) {
      if (!trafficByRoad.some((y) => y.road === road)) {
        trafficByRoad.push({ road, aadt, year: prop(x.o, 'År, gjelder for') ?? null, heavy_share: prop(x.o, 'ÅDT, andel lange kjøretøy') ?? null, m: Math.round(x.m) });
      }
    }
  }
  const segs = (roads?.objekter || []).map((s) => ({ type: s.typeVeg || '', m: nearestM(s.geometri?.wkt, here) })).filter((s) => s.m <= 30);
  const types = Array.from(new Set(segs.map((s) => s.type).filter(Boolean)));
  const sidewalkInNetwork = types.some((x) => /fortau/i.test(x));
  // Unknown (null) when neither lookup answered. «false» only means none is
  // registered: NVDB is not complete, above all on municipal roads.
  let hasSidewalk = null;
  if (sidewalkInNetwork || sidewalks?.length > 0) hasSidewalk = true;
  else if (roads || sidewalks) hasSidewalk = false;
  return {
    v: SITE_VERSION,
    crossings_100m: crossings ? crossings.length : null,
    nearest_crossing_m: crossings?.length ? Math.round(crossings[0].m) : null,
    speed_bumps_150m: bumps ? bumps.length : null,
    lights_50m: lights ? lights.length : null,
    aadt_year: t ? prop(t, 'År, gjelder for') ?? null : null,
    aadt_total: t ? prop(t, 'ÅDT, total') ?? null : null,
    heavy_share: t ? prop(t, 'ÅDT, andel lange kjøretøy') ?? null : null,
    traffic_by_road: traffic ? trafficByRoad.slice(0, 8) : null,
    road_types_30m: types,
    has_sidewalk: hasSidewalk,
    sidewalk_objects_30m: sidewalks ? sidewalks.length : null,
    has_cycleway: roads ? types.some((x) => /gang- og sykkelveg|sykkelveg|gangveg/i.test(x)) : null,
    crossing_in_network_30m: roads ? types.some((x) => /gangfelt/i.test(x)) : null,
  };
}

// Traffic on the road the case is on (by road number, e.g. «KV1376»), or null
// when that road has no count within 150 m. Never a neighbouring road's number.
export function sameRoadTraffic(roadReference, road) {
  const key = roadKey(roadReference);
  if (!key || !Array.isArray(road?.traffic_by_road)) return null;
  return road.traffic_by_road.find((x) => x.road === key) || null;
}
