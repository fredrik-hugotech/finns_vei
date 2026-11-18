import { getGrunnkretsBarn } from './supabaseRest';

// Children living around a point: the grunnkretser (SSB's smallest areas,
// a few hundred residents each) within the radius, from Geonorge's WFS, each
// counted by how much of its area lies inside the circle. An estimate, since
// children are assumed spread evenly within each grunnkrets.
const WFS = 'https://wfs.geonorge.no/skwms1/wfs.grunnkretser';

const R = 6371000;
function meters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Polygons as arrays of [lng, lat] rings (first = outer). GML posList from
// this service is «lng lat lng lat …».
function parseMembers(xml) {
  const out = [];
  for (const m of xml.split('<wfs:member>').slice(1)) {
    const kode = (m.match(/<app:grunnkretsnummer>([^<]+)</) || [])[1];
    if (!kode) continue;
    const navn = (m.match(/<app:grunnkretsnavn>([^<]+)</) || [])[1] || '';
    const polys = [];
    for (const p of m.split(/<gml:Polygon[\s>]/).slice(1)) {
      const rings = [...p.matchAll(/<gml:posList[^>]*>([^<]+)</g)].map((x) => {
        const n = x[1].trim().split(/\s+/).map(Number);
        const ring = [];
        for (let i = 0; i + 1 < n.length; i += 2) ring.push([n[i], n[i + 1]]);
        return ring;
      }).filter((r) => r.length > 3);
      if (rings.length) polys.push(rings);
    }
    if (polys.length) out.push({ kode, navn, polys });
  }
  return out;
}

const insidePoly = (pt, poly) => inRing(pt, poly[0]) && !poly.slice(1).some((hole) => inRing(pt, hole));

// Share of a grunnkrets' area within the circle, by sampling a grid.
function shareInCircle(polys, center, radiusM) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const N = 16; let inPoly = 0; let inBoth = 0;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const pt = [minX + ((i + 0.5) / N) * (maxX - minX), minY + ((j + 0.5) / N) * (maxY - minY)];
      if (!polys.some((p) => insidePoly(pt, p))) continue;
      inPoly += 1;
      if (meters(center, { lat: pt[1], lng: pt[0] }) <= radiusM) inBoth += 1;
    }
  }
  return inPoly ? inBoth / inPoly : 0;
}

export async function childrenNear({ lat, lng, radiusM = 1000 }) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map((v) => v.toFixed(6)).join(',');
  const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=app:Grunnkrets&count=400&srsName=EPSG:4326&bbox=${bbox},urn:ogc:def:crs:EPSG::4326`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  let xml = '';
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`Geonorge ${r.status}`);
    xml = await r.text();
  } finally { clearTimeout(t); }
  const areas = parseMembers(xml);
  if (!areas.length) return { grunnkrets_kode: null, grunnkrets_navn: null, barn_6_15_grunnkrets: 0, barn_6_15_1km: 0, barn_0_19_1km: 0 };
  const counts = new Map((await getGrunnkretsBarn(areas.map((a) => a.kode))).map((r) => [r.kode, r]));
  const center = { lat, lng };
  const here = areas.find((a) => a.polys.some((p) => insidePoly([lng, lat], p))) || null;
  let k615 = 0; let k019 = 0;
  for (const a of areas) {
    const c = counts.get(a.kode);
    if (!c) continue;
    const share = shareInCircle(a.polys, center, radiusM);
    k615 += c.barn_6_15 * share;
    k019 += (c.barn_0_5 + c.barn_6_15 + c.ungdom_16_19) * share;
  }
  return {
    grunnkrets_kode: here?.kode || null,
    grunnkrets_navn: here?.navn || null,
    barn_6_15_grunnkrets: here ? counts.get(here.kode)?.barn_6_15 || 0 : null,
    barn_6_15_1km: Math.round(k615),
    barn_0_19_1km: Math.round(k019),
  };
}
