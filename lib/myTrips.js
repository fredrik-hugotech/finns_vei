// Anonymous, no-login "Mine turer" tracking: a small history of bike/walk
// trips logged from this browser, kept entirely in localStorage. No server-
// side identity is created — this is just a convenience so someone can see
// their own past trips again on this device. Mirrors lib/myReports.js.
const STORAGE_KEY = 'finns-vei-my-trips';
const MAX_ENTRIES = 100;

function readList() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function writeList(list) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_e) {
    /* best effort — e.g. Safari Private Browsing can throw on write */
  }
}

// Call right after a trip has been successfully saved via POST /api/bike-trips
// — records a lightweight local-only copy so the rider can find it again on
// this device. `weather` mirrors the shape TripTracker sends: { bonus, kind }.
export function addMyTrip({ distanceM, mode, routeType, weather }) {
  if (typeof window === 'undefined') return;
  try {
    const current = readList();
    const entry = {
      distanceM: Number.isFinite(Number(distanceM)) ? Number(distanceM) : 0,
      mode: mode === 'gange' ? 'gange' : 'sykkel',
      routeType: routeType || null,
      weatherBonus: Boolean(weather?.bonus),
      weatherKind: weather?.kind || null,
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...current];
    writeList(next.slice(0, MAX_ENTRIES));
  } catch (_e) {
    /* best effort */
  }
}

export function getMyTrips() {
  if (typeof window === 'undefined') return [];
  try {
    return readList();
  } catch (_e) {
    return [];
  }
}
