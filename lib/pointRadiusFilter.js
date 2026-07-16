// Self-contained geometry helpers for the "Sjekk et sted" single-point tool.
// Deliberately tiny — this page has no route/corridor to hug, just one tapped
// point and a fixed radius, so it doesn't need lib/corridorGeometry.js (which
// only exists on an unmerged branch anyway).

const EARTH_RADIUS_M = 6371000;
const METERS_PER_DEGREE_LAT = 111320;

// Standard haversine great-circle distance between two lat/lng pairs, in metres.
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// A small [minLng, minLat, maxLng, maxLat] box padded by radiusMeters around a
// point — just enough to feed the NVDB layer endpoint's bbox param, well under
// its span limits for a single-point radius (see pages/api/nvdb/layer.js).
export function bboxAroundPoint(lat, lng, radiusMeters) {
  const dLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const dLng = radiusMeters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

export function bboxStringAroundPoint(lat, lng, radiusMeters) {
  return bboxAroundPoint(lat, lng, radiusMeters).map((value) => value.toFixed(6)).join(',');
}

// A single tapped point gets a bit more room than the 75m route corridor
// buffer used elsewhere — there's no route to hug, so 250m stays generous
// without pulling in unrelated blocks.
export const SJEKK_STED_RADIUS_M = 250;

// Same convention as the (unmerged) route tool: reports older than this are
// treated as stale context and excluded. A missing created_at is kept, not
// assumed old.
export const REPORT_MAX_AGE_YEARS = 8;

export function isReportWithinMaxAge(createdAt, maxAgeYears = REPORT_MAX_AGE_YEARS) {
  if (!createdAt) return true;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return true;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - maxAgeYears);
  return created >= cutoff;
}
