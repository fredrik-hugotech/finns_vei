// Staff-only, per-device tuning for the "Bekymringsgrad" heatmap weights.
// This is purely a local preview aid for whoever is looking at the map on
// this browser: nothing here is sent to the server, nothing is shared with
// other staff or the public, and it never changes the hardcoded defaults in
// lib/mapStyleConfig.js. Mirrors the localStorage access pattern already
// used by lib/myReports.js (SSR-safe, best-effort try/catch on every call).
const STORAGE_KEY = 'finns-vei-heatmap-weight-prefs';

function readPrefs() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_e) {
    return null;
  }
}

export function getSavedHeatmapWeightPrefs() {
  if (typeof window === 'undefined') return null;
  try {
    return readPrefs();
  } catch (_e) {
    return null;
  }
}

export function saveHeatmapWeightPrefs(prefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (_e) {
    /* best effort — e.g. Safari Private Browsing can throw on write */
  }
}

export function clearHeatmapWeightPrefs() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_e) {
    /* best effort */
  }
}
