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
