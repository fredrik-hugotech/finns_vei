// Anonymous, no-login "Mine meldinger" tracking: a small list of reports this
// browser has submitted, kept entirely in localStorage. No server-side
// identity is created — this is just a convenience so someone can find their
// own past report(s) again without having saved the share link.
const STORAGE_KEY = 'finns-vei-my-reports';
const MAX_ENTRIES = 30;

// A separate, small map of { [reportId]: isoTimestamp } recording the last
// time this browser viewed a report's status on /mine-meldinger. Kept apart
// from STORAGE_KEY so the "seen" bookkeeping never has to touch the report
// list itself. Same device-only, no server sync, privacy posture as above.
const SEEN_STORAGE_KEY = 'finns-vei-my-reports-seen';

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

export function addMyReport({ id, category }) {
  if (typeof window === 'undefined' || !id) return;
  try {
    const current = readList();
    if (current.some((entry) => entry?.id === id)) return; // already tracked, leave existing entry
    const next = [{ id, category: category || null, createdAt: new Date().toISOString() }, ...current];
    writeList(next.slice(0, MAX_ENTRIES));
  } catch (_e) {
    /* best effort */
  }
}

export function getMyReports() {
  if (typeof window === 'undefined') return [];
  try {
    return readList();
  } catch (_e) {
    return [];
  }
}

export function removeMyReport(id) {
  if (typeof window === 'undefined' || !id) return;
  try {
    const current = readList();
    writeList(current.filter((entry) => entry?.id !== id));
  } catch (_e) {
    /* best effort */
  }
  clearReportSeen(id);
}

function readSeenMap() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function writeSeenMap(map) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(map));
  } catch (_e) {
    /* best effort — e.g. Safari Private Browsing can throw on write */
  }
}

// Returns the ISO timestamp this browser last viewed the given report's
// status, or null if never recorded (e.g. a report tracked before this
// feature shipped, or one that has simply never been opened yet). Callers
// should treat null as "nothing to compare against" rather than "very old",
// so a first-ever view never shows a stale/incorrect update badge.
export function getReportLastSeenAt(id) {
  if (typeof window === 'undefined' || !id) return null;
  try {
    const map = readSeenMap();
    return typeof map[id] === 'string' ? map[id] : null;
  } catch (_e) {
    return null;
  }
}

// Records that this browser has just seen the given report's current status.
// Best effort and SSR-safe, matching the rest of this module.
export function markReportSeen(id, when) {
  if (typeof window === 'undefined' || !id) return;
  try {
    const map = readSeenMap();
    map[id] = when || new Date().toISOString();
    writeSeenMap(map);
  } catch (_e) {
    /* best effort */
  }
}

function clearReportSeen(id) {
  if (typeof window === 'undefined' || !id) return;
  try {
    const map = readSeenMap();
    if (!(id in map)) return;
    delete map[id];
    writeSeenMap(map);
  } catch (_e) {
    /* best effort */
  }
}
