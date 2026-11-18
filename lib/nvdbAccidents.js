// Police-registered injury accidents near a point, from NVDB (object type
// 570, «Trafikkulykke»). The public API has no coordinates on accidents, only
// a position along the road network («0.96@625292»), so the point is worked
// out from that road link's geometry. Accidents are found with a bounding box
// around the point, then the exact distance is used where the position could
// be worked out.
const BASE = (process.env.NVDB_BASE_URL || 'https://nvdbapiles.atlas.vegvesen.no').replace(/\/+$/, '');
const HEADERS = { Accept: 'application/json', 'X-Client': 'finnsvei' };
const seqCache = new Map(); // veglenkesekvens id -> veglenker (geometry), shared per function instance

async function getJson(url, timeoutMs = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: HEADERS, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (_e) {
    return null;
  } finally { clearTimeout(t); }
}

const R = 6371000;
function meters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// «LINESTRING Z (lat lng z, …)» — NVDB writes srid 4326 as latitude first.
function lineFromWkt(wkt) {
  const m = String(wkt || '').match(/\(([^()]+)\)/);
  if (!m) return [];
  return m[1].split(',').map((p) => p.trim().split(/\s+/).map(Number)).filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map(([a, b]) => (Math.abs(a) > 40 && Math.abs(b) < 40 ? { lat: a, lng: b } : { lat: b, lng: a }));
}

function pointAlong(line, f) {
  if (!line.length) return null;
  if (line.length === 1) return line[0];
  const seg = [];
  let total = 0;
  for (let i = 1; i < line.length; i += 1) { const d = meters(line[i - 1], line[i]); seg.push(d); total += d; }
  let target = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < seg.length; i += 1) {
    if (target <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? target / seg[i] : 0;
      return { lat: line[i].lat + (line[i + 1].lat - line[i].lat) * k, lng: line[i].lng + (line[i + 1].lng - line[i].lng) * k };
    }
    target -= seg[i];
  }
  return line[line.length - 1];
}

async function roadLinks(seqId) {
  if (seqCache.has(seqId)) return seqCache.get(seqId);
  const d = await getJson(`${BASE}/vegnett/api/v4/veglenkesekvenser/${encodeURIComponent(seqId)}?srid=4326`);
  const links = (d?.veglenker || []).map((v) => ({
    start: Number(v.startposisjon), end: Number(v.sluttposisjon),
    from: v.startdato || null, to: v.sluttdato || null,
    line: lineFromWkt(v.geometri?.wkt),
  })).filter((v) => v.line.length);
  if (seqCache.size > 2000) seqCache.clear();
  seqCache.set(seqId, links);
  return links;
}

async function positionOf(obj, date) {
  const st = obj?.lokasjon?.stedfestinger?.[0];
  const seqId = st?.veglenkesekvensid;
  const pos = Number(st?.relativPosisjon);
  if (!seqId || !Number.isFinite(pos)) return null;
  const links = (await roadLinks(seqId)).filter((v) => pos >= v.start && pos <= v.end);
  if (!links.length) return null;
  // Prefer the road link that existed when the accident happened.
  const when = date || '';
  const link = links.find((v) => (!v.from || v.from <= when) && (!v.to || v.to > when)) || links[0];
  const f = link.end > link.start ? (pos - link.start) / (link.end - link.start) : 0;
  return pointAlong(link.line, f);
}

// Gives accident objects without geometry a point worked out from the road
// network, so map layers can draw them. Mutates and returns the objects.
export async function addAccidentPositions(objects, max = 250) {
  const todo = objects.filter((o) => !o?.geometri && o?.lokasjon?.stedfestinger?.length).slice(0, max);
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const o = todo[i]; i += 1;
      const date = (o.egenskaper || []).find((e) => e.navn === 'Ulykkesdato')?.verdi || '';
      try {
        const where = await positionOf(o, String(date).slice(0, 10));
        if (where) o.geometri = { geojson: { type: 'Point', coordinates: [where.lng, where.lat] } };
      } catch (_e) { /* leave it out */ }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return objects;
}

function props(obj) {
  const out = {};
  for (const e of obj?.egenskaper || []) out[e.navn] = e.verdi;
  return out;
}

const n = (v) => Number(v) || 0;

// Returns { count_total, count_10y, pedestrian_10y, cyclist_10y, dark_10y, latest_date, items[] }.
export async function accidentsNear({ lat, lng, radiusM = 100 }) {
  const dLat = (radiusM * 1.15) / 111320;
  const dLng = (radiusM * 1.15) / (111320 * Math.cos((lat * Math.PI) / 180));
  const box = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((v) => v.toFixed(6)).join(',');
  let url = `${BASE}/vegobjekter/api/v4/vegobjekter/570?srid=4326&inkluder=egenskaper,lokasjon&antall=200&kartutsnitt=${box}`;
  const objects = [];
  for (let page = 0; page < 3 && url; page += 1) {
    const d = await getJson(url);
    if (!d) { if (page === 0) throw new Error('NVDB svarte ikke'); break; }
    objects.push(...(d.objekter || []));
    url = (d.objekter || []).length >= 200 ? d.metadata?.neste?.href || null : null;
  }
  const here = { lat, lng };
  const tenYears = new Date(Date.now() - 10 * 365.25 * 864e5).toISOString().slice(0, 10);
  const items = [];
  for (const o of objects.slice(0, 120)) {
    const p = props(o);
    const date = String(p.Ulykkesdato || '').slice(0, 10) || (p['År (Ny)'] ? `${p['År (Ny)']}-01-01` : null);
    let where = null;
    try { where = await positionOf(o, date); } catch (_e) { where = null; }
    const dist = where ? Math.round(meters(here, where)) : null;
    if (dist !== null && dist > radiusM) continue;
    items.push({
      id: o.id,
      date,
      type: p['Ulykkestype (Ny)'] || null,
      code: p.Ulykkeskode || null,
      pedestrian: n(p['Antall Fotgjengere (Ny)']) > 0,
      cyclist: n(p['Antall Sykkel (Ny)']) > 0,
      light: p.Lysforhold || null,
      surface: p.Føreforhold || null,
      speed: n(p.Fartsgrense) || null,
      units: n(p['Antall enheter']) || null,
      dist_m: dist,
      lat: where ? Number(where.lat.toFixed(6)) : null,
      lng: where ? Number(where.lng.toFixed(6)) : null,
    });
  }
  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const recent = items.filter((i) => i.date && i.date >= tenYears);
  return {
    radius_m: radiusM,
    count_total: items.length,
    count_10y: recent.length,
    pedestrian_10y: recent.filter((i) => i.pedestrian).length,
    cyclist_10y: recent.filter((i) => i.cyclist).length,
    dark_10y: recent.filter((i) => /mørk/i.test(i.light || '')).length,
    latest_date: items[0]?.date || null,
    items: items.slice(0, 25),
  };
}

// One short line for Finn's prompts.
export function accidentLine(a) {
  if (!a) return null;
  if (!a.count_total) return `Ingen politiregistrerte personskadeulykker innen ${a.radius_m || 100} m.`;
  const parts = [`${a.count_10y} ${a.count_10y === 1 ? 'personskadeulykke' : 'personskadeulykker'} innen ${a.radius_m} m siste 10 år (${a.count_total} totalt)`];
  if (a.pedestrian_10y) parts.push(`${a.pedestrian_10y} med fotgjenger`);
  if (a.cyclist_10y) parts.push(`${a.cyclist_10y} med syklist`);
  if (a.dark_10y) parts.push(`${a.dark_10y} i mørke`);
  if (a.latest_date) parts.push(`siste ${String(a.latest_date).slice(0, 4)}`);
  const types = Array.from(new Set((a.items || []).slice(0, 6).map((i) => i.code || i.type).filter(Boolean))).slice(0, 3);
  return `${parts.join(', ')}.${types.length ? ` Typer: ${types.join('; ')}.` : ''}`;
}
