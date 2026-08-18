// Privacy-by-design location helpers for the children's cycling competitions.
//
// We never store a child's exact starting point. The origin of a logged trip
// is snapped to a coarse grid so the published map can show *where children
// move to/from leisure activities* without revealing a specific home address.
//
// The destination (a sports club / public venue) is public and stored precisely.

const DEFAULT_GRID_METERS = 100;
const METERS_PER_DEG_LAT = 111320;

// Snap a coordinate to the nearest grid cell of `meters` size. The grid is
// latitude-aware so cells stay roughly square regardless of how far north we
// are. Returns the cell *centre* so points never sit on a child's real spot.
export function snapToGrid(lat, lng, meters = DEFAULT_GRID_METERS) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

  const latStep = meters / METERS_PER_DEG_LAT;
  const lngStep = meters / (METERS_PER_DEG_LAT * Math.cos((latNum * Math.PI) / 180) || METERS_PER_DEG_LAT);

  const snappedLat = (Math.floor(latNum / latStep) + 0.5) * latStep;
  const snappedLng = (Math.floor(lngNum / lngStep) + 0.5) * lngStep;

  return {
    lat: Number(snappedLat.toFixed(6)),
    lng: Number(snappedLng.toFixed(6)),
  };
}

export const GRID_METERS = DEFAULT_GRID_METERS;
// Radius around the trip's start (likely home) that is never uploaded at
// full precision — set by product decision on 2026-08-18. (Briefly 150 m
// between 2026-08-08 and 2026-08-18 to match stale docs that had assumed a
// larger radius than intended; 50 m is the actual intended protection zone.)
export const CLIP_METERS = 50;

// Design principle (2026-08-18): this code never determines or stores what a
// child's true "home" coordinate is — not even transiently as a privacy
// anchor. Every caller that needs a reference point to clip/snap around must
// pass an already-jittered one (see randomOffsetPoint below), not the raw
// first GPS fix. This matters beyond taste: the previous design used the
// exact claimed start point as the clip boundary's center, so anyone
// crafting a request (bypassing the on-device clip entirely, or POSTing
// straight to /api/bike-trips) could place the true start just outside a
// *known, exactly-computable* radius and have it survive uncensored. A
// random, unpredictable anchor removes that computability — nobody, client
// or attacker, can know in advance exactly where the protected zone lands.

// Offsets `point` by a random bearing and a random distance in
// [minMeters, maxMeters]. Used to turn a claimed "start" into a stand-in
// reference that is never the true coordinate, before it's used for
// anything — the whole point is that no code path ever reads or stores the
// literal, exact start fix as a meaningful "this is home" value.
export function randomOffsetPoint(point, { minMeters = CLIP_METERS * 0.5, maxMeters = CLIP_METERS } = {}) {
  if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return null;
  const bearing = Math.random() * 2 * Math.PI;
  const distance = minMeters + Math.random() * (maxMeters - minMeters);
  const dLat = (distance * Math.cos(bearing)) / METERS_PER_DEG_LAT;
  const dLng = (distance * Math.sin(bearing)) / (METERS_PER_DEG_LAT * Math.cos((point.lat * Math.PI) / 180) || METERS_PER_DEG_LAT);
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}

// Great-circle distance in metres between two {lat, lng} points.
export function distanceMeters(a, b) {
  if (!a || !b) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Total length of an ordered list of {lat, lng} points, in metres.
export function pathDistanceMeters(points = []) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

// Privacy core: turn a raw GPS path into the only thing we ever persist for the
// heatmap — an unordered set of coarse grid cells. We remove the segment within
// ~50 m of `homeRef` so the true start can't be recovered. The destination (a
// public sports venue) is kept, since everyone already knows where it is.
// Run this ON THE DEVICE so raw coordinates never leave the phone.
// `homeRef` must be an already-jittered stand-in (randomOffsetPoint), never
// the raw first fix — see the design note above CLIP_METERS. Defaults to
// `points[0]` only for callers that haven't been updated; every real caller
// in this codebase now passes an explicit jittered homeRef.
export function clipAndSnapCells(points = [], { clipMeters = CLIP_METERS, gridMeters = GRID_METERS, homeRef } = {}) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const start = homeRef || points[0];
  const cells = new Map();
  for (const point of points) {
    if (!point) continue;
    if (distanceMeters(point, start) <= clipMeters) continue; // protect home only
    const snapped = snapToGrid(point.lat, point.lng, gridMeters);
    if (!snapped) continue;
    cells.set(`${snapped.lng},${snapped.lat}`, [snapped.lng, snapped.lat]);
  }
  return Array.from(cells.values());
}

// Ordered, start-clipped route for drawing/heatmapping. We remove the segment
// within ~50 m of `homeRef` (a "privacy zone" like Strava's), so the home is
// never shown, but keep the on-road middle and the public destination at full
// resolution. Returns ordered [lng, lat] pairs. See clipAndSnapCells above for
// why `homeRef` should always be an already-jittered stand-in, not the raw fix.
export function clipPath(points = [], { clipMeters = CLIP_METERS, homeRef } = {}) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const start = homeRef || points[0];
  const out = [];
  let last = null;
  for (const point of points) {
    if (!point) continue;
    if (distanceMeters(point, start) <= clipMeters) continue; // protect home only
    const lng = Number(point.lng.toFixed(5));
    const lat = Number(point.lat.toFixed(5));
    if (last && Math.abs(last[0] - lng) < 1e-5 && Math.abs(last[1] - lat) < 1e-5) continue;
    out.push([lng, lat]);
    last = [lng, lat];
  }
  return out;
}

