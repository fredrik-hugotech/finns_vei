// "Turstreak": a personal, on-device streak counter for the children's
// cycling/walking module. Tracks how many consecutive DEVICE-LOCAL calendar
// days in a row this browser has logged at least one trip, plus this week's
// trip count. Same trust model as lib/myReports.js: localStorage only, no
// login, no server sync, per-device and resettable by clearing browser
// storage — that tradeoff is already accepted for "Mine meldinger" and we
// deliberately keep the streak just as local-only and best-effort.
const STORAGE_KEY = 'finns-vei-trip-streak';
// After this local hour, if yesterday had a trip but today doesn't yet, we
// gently nudge on the hub. Purely a render-time check — no notifications.
const STREAK_AT_RISK_HOUR = 12;

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Device-local YYYY-MM-DD. Deliberately NOT date.toISOString() (that's UTC
// and would flip the "day" around midnight for Norwegian timezones) — we
// always want "what calendar day is it where this phone is right now".
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1); // local midnight
}

function daysBetweenKeys(fromKey, toKey) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

// Monday-start week key (device-local), matching the Norwegian week
// convention so "this week" doesn't reset mid-weekend.
function weekStartKey(date = new Date()) {
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - diffToMonday);
  return localDateKey(monday);
}

function readState() {
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

function writeState(state) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_e) {
    /* best effort — e.g. Safari Private Browsing can throw on write */
  }
}

const EMPTY_DISPLAY = { current: 0, weekCount: 0, lastDay: null, isNewStreak: false, loggedToday: false, atRisk: false };

// Turn the raw stored state (current streak as of its lastDay) into what the
// UI should show *right now*. If more than one device-local day has passed
// since the last logged trip, the streak is effectively broken even though
// we haven't overwritten `current` in storage yet — we only "commit" a reset
// to storage the next time a trip is actually logged, but for display we
// already show 0 instead of a stale number.
function toDisplayState(state, now) {
  if (!state || !state.lastDay) return { ...EMPTY_DISPLAY };
  const todayKey = localDateKey(now);
  const gap = daysBetweenKeys(state.lastDay, todayKey);
  const sameWeek = state.weekStart === weekStartKey(now);
  const current = gap <= 1 && gap >= 0 ? (state.current || 0) : 0;
  const loggedToday = gap === 0;
  const atRisk = !loggedToday && gap === 1 && current > 0 && now.getHours() >= STREAK_AT_RISK_HOUR;
  return {
    current,
    weekCount: sameWeek ? (state.weekCount || 0) : 0,
    lastDay: state.lastDay,
    isNewStreak: current === 1,
    loggedToday,
    atRisk,
  };
}

// Call once after a trip has been logged in the app (TripTracker "stop and
// save"). Updates the streak/week counters in localStorage and returns the
// resulting display-ready state (see getTripStreak below). Safe to call
// repeatedly for the same day — it won't double count the streak day, but it
// does count towards "trips logged this week".
export function recordTrip(now = new Date()) {
  if (typeof window === 'undefined') return { ...EMPTY_DISPLAY };
  try {
    const todayKey = localDateKey(now);
    const thisWeekKey = weekStartKey(now);
    const prev = readState();

    let current;
    if (!prev || !prev.lastDay) {
      current = 1; // brand new device/browser — first trip ever
    } else if (prev.lastDay === todayKey) {
      current = prev.current || 1; // already logged today, don't double count
    } else {
      const gap = daysBetweenKeys(prev.lastDay, todayKey);
      // Exactly one day since the last trip -> extend the streak. Any bigger
      // gap (or a negative gap from a clock oddity) -> today is day 1 of a
      // fresh streak, not 0.
      current = gap === 1 ? (prev.current || 0) + 1 : 1;
    }

    const sameWeek = Boolean(prev) && prev.weekStart === thisWeekKey;
    const weekCount = (sameWeek ? prev.weekCount || 0 : 0) + 1;

    const next = { current, lastDay: todayKey, weekStart: thisWeekKey, weekCount };
    writeState(next);
    return toDisplayState(next, now);
  } catch (_e) {
    return { ...EMPTY_DISPLAY };
  }
}

// Read-only: current streak/this-week state for rendering (e.g. a persistent
// badge on the /sykle hub), without recording a trip. SSR-safe, no-op on the
// server, and safe to call on every render.
export function getTripStreak(now = new Date()) {
  if (typeof window === 'undefined') return { ...EMPTY_DISPLAY };
  try {
    return toDisplayState(readState(), now);
  } catch (_e) {
    return { ...EMPTY_DISPLAY };
  }
}
