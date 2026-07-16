// Dependency-free geometry helpers for "Din vei": a hand-drawn, multi-point
// route (a parent, walker or cyclist taps out the actual path they take,
// point by point) with a buffer radius around every segment, used to filter
// existing public reports/accidents that fall near the route. No turf.js or
// other geometry library in this project's package.json — everything here
// is plain haversine + a local flat-earth (equirectangular) projection,
// which is accurate enough for the short (typically < a few km)
// walking/cycling distances a school route covers.

const EARTH_RADIUS_M = 6371000;

// Default buffer radius (metres) around every segment of the drawn route
// used to decide whether a report/accident counts as "along the route".
// Named constant so it's tuned in one place instead of scattered magic
// numbers.
export const CORRIDOR_BUFFER_RADIUS_M = 75;

// A drawn route needs at least a home point and one more tap to form a
// segment; below this it has no meaningful corridor yet.
export const MIN_ROUTE_POINTS = 2;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

// Standard great-circle distance between two {lng,lat} points, in metres.
export function haversineDistanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Projects a {lng,lat} point onto a local flat-earth XY plane (metres)
// centred at `origin`. Good enough over the few-kilometre spans a school
// route covers; not meant for long distances.
function projectToLocalXY(point, origin) {
  const latRad = toRad(origin.lat);
  const x = toRad(point.lng - origin.lng) * Math.cos(latRad) * EARTH_RADIUS_M;
  const y = toRad(point.lat - origin.lat) * EARTH_RADIUS_M;
  return { x, y };
}

// Inverse of projectToLocalXY: turns a local metre offset from `origin`
// back into a {lng,lat} point.
function localXYToLngLat(origin, x, y) {
  const latRad = toRad(origin.lat);
  const lat = origin.lat + toDeg(y / EARTH_RADIUS_M);
  const lng = origin.lng + toDeg(x / (EARTH_RADIUS_M * Math.cos(latRad)));
  return { lng, lat };
}

// Shortest distance (metres) from `point` to the line segment [segStart,
// segEnd], via local-plane projection + standard point-to-segment clamping.
export function pointToSegmentDistanceMeters(point, segStart, segEnd) {
  if (!point || !segStart || !segEnd) return Infinity;
  const origin = segStart;
  const p = projectToLocalXY(point, origin);
  const a = { x: 0, y: 0 };
  const b = projectToLocalXY(segEnd, origin);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;

  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  const ddx = p.x - closestX;
  const ddy = p.y - closestY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

// Total length of the drawn route (sum of consecutive segment distances),
// in metres.
export function routeLengthMeters(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += haversineDistanceMeters(path[i], path[i + 1]);
  }
  return total;
}

// Bounding box [minLng, minLat, maxLng, maxLat] covering every point of the
// route (+ buffer on every side), for the NVDB accident-layer bbox query.
// Padding is computed in degrees from the buffer radius in metres using the
// same rough metres-per-degree conversion used elsewhere for short spans.
export function pathBbox(path, bufferMeters = CORRIDOR_BUFFER_RADIUS_M) {
  if (!Array.isArray(path) || path.length === 0) return null;
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const midLat = (minLat + maxLat) / 2;
  const metersPerDegreeLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos(toRad(midLat));

  const latPad = bufferMeters / metersPerDegreeLat;
  const lngPad = bufferMeters / Math.max(metersPerDegreeLng, 1);

  return [minLng - lngPad, minLat - latPad, maxLng + lngPad, maxLat + latPad];
}

// Builds a "stadium"/capsule polygon ring (array of [lng,lat] positions,
// closed) approximating the Minkowski buffer of the A-B segment by
// `bufferMeters` — used purely to draw one segment's corridor on the map
// for visual context. Not used for the actual filtering
// (pointToSegmentDistanceMeters is the source of truth for "is this inside
// the corridor"). Segment-local helper for buildRouteCorridorPolygons below.
function buildSegmentCapsuleRing(pointA, pointB, bufferMeters = CORRIDOR_BUFFER_RADIUS_M, capSteps = 12) {
  const origin = pointA;
  const a = { x: 0, y: 0 };
  const b = projectToLocalXY(pointB, origin);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);

  // Degenerate case (both points equal, or extremely close): draw a plain
  // circle around the single point instead of a capsule.
  if (length < 0.5) {
    const ring = [];
    const steps = capSteps * 2;
    for (let i = 0; i <= steps; i += 1) {
      const angle = (2 * Math.PI * i) / steps;
      const x = bufferMeters * Math.cos(angle);
      const y = bufferMeters * Math.sin(angle);
      const { lng, lat } = localXYToLngLat(origin, x, y);
      ring.push([lng, lat]);
    }
    return ring;
  }

  const theta = Math.atan2(dy, dx);
  const ring = [];

  // Semicircular cap around `a`, facing away from `b` (theta+90 -> theta+270).
  for (let i = 0; i <= capSteps; i += 1) {
    const angle = theta + Math.PI / 2 + (Math.PI * i) / capSteps;
    const x = a.x + bufferMeters * Math.cos(angle);
    const y = a.y + bufferMeters * Math.sin(angle);
    const { lng, lat } = localXYToLngLat(origin, x, y);
    ring.push([lng, lat]);
  }

  // Semicircular cap around `b`, facing away from `a` (theta-90 -> theta+90).
  for (let i = 0; i <= capSteps; i += 1) {
    const angle = theta - Math.PI / 2 + (Math.PI * i) / capSteps;
    const x = b.x + bufferMeters * Math.cos(angle);
    const y = b.y + bufferMeters * Math.sin(angle);
    const { lng, lat } = localXYToLngLat(origin, x, y);
    ring.push([lng, lat]);
  }

  ring.push(ring[0]);
  return ring;
}

// Builds one capsule ring per segment of the drawn route. Rendered as
// several overlapping polygons rather than unioned into one shape (this
// project has no polygon-union library) — at typical corridor widths and
// fill opacity the overlap at each bend is visually unnoticeable, and every
// segment is still fully covered with no gaps at the joints.
export function buildRouteCorridorPolygons(path, bufferMeters = CORRIDOR_BUFFER_RADIUS_M, capSteps = 12) {
  if (!Array.isArray(path) || path.length < 2) return [];
  const rings = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    rings.push(buildSegmentCapsuleRing(path[i], path[i + 1], bufferMeters, capSteps));
  }
  return rings;
}

// Filters a list of GeoJSON Point features down to those within
// `bufferMeters` of ANY segment of the drawn route, returning each kept
// feature alongside its shortest distance to the route (metres) for
// optional sorting/display.
export function filterFeaturesInPathCorridor(features, path, bufferMeters = CORRIDOR_BUFFER_RADIUS_M) {
  if (!Array.isArray(features) || !Array.isArray(path) || path.length < 2) return [];
  const result = [];
  features.forEach((feature) => {
    const coords = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
    if (!coords || coords.length < 2) return;
    const point = { lng: coords[0], lat: coords[1] };
    let distanceM = Infinity;
    for (let i = 0; i < path.length - 1; i += 1) {
      const segmentDistance = pointToSegmentDistanceMeters(point, path[i], path[i + 1]);
      if (segmentDistance < distanceM) distanceM = segmentDistance;
    }
    if (distanceM <= bufferMeters) {
      result.push({ feature, distanceM });
    }
  });
  result.sort((x, y) => x.distanceM - y.distanceM);
  return result;
}
