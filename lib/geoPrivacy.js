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
export const CLIP_METERS = 150;

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
// ~150 m of the START (the home) so it can't be recovered. The destination (a
// public sports venue) is kept, since everyone already knows where it is.
// Run this ON THE DEVICE so raw coordinates never leave the phone.
export function clipAndSnapCells(points = [], { clipMeters = CLIP_METERS, gridMeters = GRID_METERS } = {}) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const start = points[0];
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
// within ~150 m of the start (a "privacy zone" like Strava's), so the home is
// never shown, but keep the on-road middle and the public destination at full
// resolution. Returns ordered [lng, lat] pairs.
export function clipPath(points = [], { clipMeters = CLIP_METERS } = {}) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const start = points[0];
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

