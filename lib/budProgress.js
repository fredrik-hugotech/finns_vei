// Purely local, per-device tracking of which "Finns bud" commandments a
// child has answered correctly at least once in the post-trip quiz
// (components/BudQuiz.js). Nothing here is sent to the server and nothing
// is tied to any user identity — same privacy posture, and the same
// SSR-safe read/write/try-catch pattern, as lib/myReports.js and
// lib/heatmapWeightPrefs.js. Used to show a small celebration badge on
// /bud once every kid commandment in the quiz has been answered correctly
// on this device.
const STORAGE_KEY = 'finns-vei-bud-progress';

function readSolved() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch (_e) {
    return [];
  }
}

function writeSolved(list) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_e) {
    /* best effort — e.g. Safari Private Browsing can throw on write */
  }
}

// Record commandment `n` as answered correctly at least once on this device.
export function markBudCorrect(n) {
  if (typeof window === 'undefined' || !Number.isInteger(n)) return;
  try {
    const current = readSolved();
    if (current.includes(n)) return; // already tracked
    writeSolved([...current, n].sort((a, b) => a - b));
  } catch (_e) {
    /* best effort */
  }
}

export function getSolvedBud() {
  if (typeof window === 'undefined') return [];
  try {
    return readSolved();
  } catch (_e) {
    return [];
  }
}

export function clearBudProgress() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_e) {
    /* best effort */
  }
}
