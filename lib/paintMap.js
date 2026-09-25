// «Mal kartet» — the competition type where clubs paint the roads they ride.
//
// Every stored route (already home-clipped, see lib/geoPrivacy.js) is snapped
// to a ~30 m grid and cut into edges. An edge is *painted* for a club once at
// least MIN_TRIPS different trips from that club have used it — so a single
// child's route never shows up on its own, and riding together is what
// colours the map. The club with the most painted edges owns each edge (ties
// go to whoever got there first) and the club owning the most edges wins.
//
// Pure functions, shared by the stats builder, the trip endpoint (to tell a
// child how many new edges they just painted) and the demo page.
export const PAINT_GRID_M = 30;
export const MIN_TRIPS = 2;

const DEG_LAT = 111320;

function snapKey(lng, lat, gridM) {
  const dLat = gridM / DEG_LAT;
  const dLng = gridM / (DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const iy = Math.round(lat / dLat);
  const ix = Math.round(lng / dLng);
  return { key: `${iy},${ix}`, pt: [Number((ix * dLng).toFixed(5)), Number((iy * dLat).toFixed(5))] };
}

// Unique edges of one path: Map<edgeKey, { a, b, ak, bk }>.
export function pathEdges(path, gridM = PAINT_GRID_M) {
  const out = new Map();
  let prev = null;
  for (const point of path || []) {
    const lng = Array.isArray(point) ? Number(point[0]) : Number(point?.lng);
    const lat = Array.isArray(point) ? Number(point[1]) : Number(point?.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const cur = snapKey(lng, lat, gridM);
    if (prev && prev.key !== cur.key) {
      const first = prev.key < cur.key;
      const ek = first ? `${prev.key}|${cur.key}` : `${cur.key}|${prev.key}`;
      if (!out.has(ek)) out.set(ek, { a: first ? prev.pt : cur.pt, b: first ? cur.pt : prev.pt, ak: first ? prev.key : cur.key, bk: first ? cur.key : prev.key });
    }
    if (!prev || prev.key !== cur.key) prev = cur;
  }
  return out;
}

// Chain edges into polylines (same trick as the heat geometry) so the
// GeoJSON stays small.
function chain(edges) {
  const at = new Map();
  for (const e of edges) for (const k of [e.ak, e.bk]) { if (!at.has(k)) at.set(k, []); at.get(k).push(e); }
  const used = new Set();
  const lines = [];
  for (const start of edges) {
    if (used.has(start)) continue;
    used.add(start);
    const line = [start.a, start.b];
    let endKey = start.bk;
    for (;;) {
      const next = (at.get(endKey) || []).find((e) => !used.has(e));
      if (!next) break;
      used.add(next);
      if (next.ak === endKey) { line.push(next.b); endKey = next.bk; } else { line.push(next.a); endKey = next.ak; }
      if (line.length > 400) break;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * @param {Array<{club:string, path:Array, createdAt?:string}>} trips
 * @param {{ minTrips?: number, colorFor?: (club:string)=>string, gridM?: number }} opts
 */
export function buildPaint(trips, { minTrips = MIN_TRIPS, colorFor = () => '#0b5d4d', gridM = PAINT_GRID_M } = {}) {
  // edgeKey -> { geom, byClub: Map<club, { n, first }> }
  const edges = new Map();
  for (const trip of trips || []) {
    const club = trip.club || 'Ukjent';
    const t = Date.parse(trip.createdAt || '') || 0;
    for (const [ek, geom] of pathEdges(trip.path, gridM)) {
      let e = edges.get(ek);
      if (!e) { e = { geom, byClub: new Map() }; edges.set(ek, e); }
      const c = e.byClub.get(club) || { n: 0, first: Infinity };
      c.n += 1;
      if (t && t < c.first) c.first = t;
      e.byClub.set(club, c);
    }
  }
  const owned = new Map(); // club -> edges[]
  let paintedEdges = 0;
  for (const e of edges.values()) {
    let owner = null; let best = null;
    for (const [club, c] of e.byClub) {
      if (c.n < minTrips) continue;
      if (!best || c.n > best.n || (c.n === best.n && c.first < best.first)) { owner = club; best = c; }
    }
    if (!owner) continue;
    paintedEdges += 1;
    if (!owned.has(owner)) owned.set(owner, []);
    owned.get(owner).push(e.geom);
  }
  const leaderboard = [...owned.entries()]
    .map(([club, list]) => ({ club, edges: list.length, percent: paintedEdges ? Math.round((list.length / paintedEdges) * 100) : 0 }))
    .sort((a, b) => b.edges - a.edges || a.club.localeCompare(b.club, 'nb'));
  const features = [...owned.entries()].map(([club, list]) => ({
    type: 'Feature',
    properties: { club, color: colorFor(club), edges: list.length },
    geometry: { type: 'MultiLineString', coordinates: chain(list) },
  }));
  return { geojson: { type: 'FeatureCollection', features }, leaderboard, paintedEdges, totalEdges: edges.size };
}

// How many edges a club's newest trip pushed over the MIN_TRIPS line.
// `clubTrips` are the club's earlier trips (without the new one).
export function paintDeltaForTrip(clubTrips, newPath, { minTrips = MIN_TRIPS, gridM = PAINT_GRID_M } = {}) {
  const counts = new Map();
  for (const trip of clubTrips || []) for (const ek of pathEdges(trip.path, gridM).keys()) counts.set(ek, (counts.get(ek) || 0) + 1);
  let painted = 0; let touched = 0;
  for (const ek of pathEdges(newPath, gridM).keys()) {
    touched += 1;
    const before = counts.get(ek) || 0;
    if (before < minTrips && before + 1 >= minTrips) painted += 1;
  }
  return { painted, touched };
}
