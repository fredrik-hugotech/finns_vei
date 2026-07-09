// Anonymous, no-login "Mine meldinger" tracking: a small list of reports this
// browser has submitted, kept entirely in localStorage. No server-side
// identity is created — this is just a convenience so someone can find their
// own past report(s) again without having saved the share link.
const STORAGE_KEY = 'finns-vei-my-reports';
const MAX_ENTRIES = 30;

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
}
