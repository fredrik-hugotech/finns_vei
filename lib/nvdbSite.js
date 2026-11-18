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

export async function siteNear({ lat, lng }) {
  const here = { lat, lng };
  const [crossings, bumps, lights, traffic, roads] = await Promise.all([
    objectsNear(174, lat, lng, 100),
    objectsNear(103, lat, lng, 150),
    objectsNear(87, lat, lng, 50),
    objectsNear(540, lat, lng, 80, ',egenskaper'),
    getJson(`${BASE}/vegnett/api/v4/veglenkesekvenser/segmentert?srid=4326&antall=100&kartutsnitt=${box(lat, lng, 30)}`),
  ]);
  const t = traffic?.[0]?.o;
  const segs = (roads?.objekter || []).map((s) => ({ type: s.typeVeg || '', m: nearestM(s.geometri?.wkt, here) })).filter((s) => s.m <= 30);
  const types = Array.from(new Set(segs.map((s) => s.type).filter(Boolean)));
  return {
    crossings_100m: crossings ? crossings.length : null,
    nearest_crossing_m: crossings?.length ? Math.round(crossings[0].m) : null,
    speed_bumps_150m: bumps ? bumps.length : null,
    lights_50m: lights ? lights.length : null,
    aadt_year: t ? prop(t, 'År, gjelder for') ?? null : null,
    aadt_total: t ? prop(t, 'ÅDT, total') ?? null : null,
    heavy_share: t ? prop(t, 'ÅDT, andel lange kjøretøy') ?? null : null,
    road_types_30m: types,
    has_sidewalk: roads ? types.some((x) => /fortau/i.test(x)) : null,
    has_cycleway: roads ? types.some((x) => /gang- og sykkelveg|sykkelveg|gangveg/i.test(x)) : null,
    crossing_in_network_30m: roads ? types.some((x) => /gangfelt/i.test(x)) : null,
  };
}
