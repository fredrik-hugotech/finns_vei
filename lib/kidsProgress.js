// Kid-facing progression computed purely from the local trip list
// (lib/myTrips.js) and the local bud-quiz progress. Nothing here touches the
// server or any identity: levels, badges and streaks live on the child's own
// device, like a sticker book. All functions are pure and SSR-safe.

export const LEVELS = [
  { name: 'Sykkelspire', min: 0 },
  { name: 'Pedalvenn', min: 3 },
  { name: 'Veiviser', min: 8 },
  { name: 'Trafikkhelt', min: 15 },
  { name: 'Kaptein', min: 30 },
  { name: 'Legende', min: 60 },
];

export const WEEKLY_GOAL = 3;

const dayKey = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

// Consecutive days with at least one trip, ending today or yesterday.
export function computeStreak(trips, now = new Date()) {
  const days = new Set(trips.map((t) => dayKey(t.createdAt)).filter(Boolean));
  if (!days.size) return 0;
  const today = dayKey(now.toISOString());
  let cursor = days.has(today) ? today : dayKey(new Date(now.getTime() - 86400000).toISOString());
  if (!days.has(cursor)) return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = dayKey(new Date(new Date(`${cursor}T12:00:00`).getTime() - 86400000).toISOString());
  }
  return streak;
}

// Monday-based week key so "ukas utfordring" resets on Mondays.
export function weekKey(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return dayKey(d.toISOString());
}

export function levelFor(tripCount) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i += 1) if (tripCount >= LEVELS[i].min) idx = i;
  const level = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  const span = next ? next.min - level.min : 1;
  const into = next ? tripCount - level.min : span;
  return {
    index: idx,
    name: level.name,
    next: next ? next.name : null,
    tripsToNext: next ? Math.max(0, next.min - tripCount) : 0,
    percent: next ? Math.round((into / span) * 100) : 100,
  };
}

// Badge definitions: id, name, how to earn (kid wording), and a test.
export const BADGES = [
  { id: 'forste', name: 'Første tur', how: 'Registrer din første tur', icon: 'bike', test: (s) => s.trips >= 1 },
  { id: 'fem', name: 'Fem på rad', how: '5 turer', icon: 'five', test: (s) => s.trips >= 5 },
  { id: 'ti', name: 'Tier\'n', how: '10 turer', icon: 'ten', test: (s) => s.trips >= 10 },
  { id: 'hjelm', name: 'Hjelmhelt', how: '5 turer med hjelm', icon: 'helmet', test: (s) => s.helmetTrips >= 5 },
  { id: 'regn', name: 'Værhelt', how: 'En tur i regn eller snø', icon: 'rain', test: (s) => s.rainTrips >= 1 },
  { id: 'skole', name: 'Skoleveien', how: '5 turer til skolen', icon: 'school', test: (s) => s.schoolTrips >= 5 },
  { id: 'langtur', name: 'Langtur', how: 'En tur på minst 5 km', icon: 'route', test: (s) => s.longestM >= 5000 },
  { id: 'rekke', name: 'Tre dager på rad', how: 'Tur tre dager etter hverandre', icon: 'flame', test: (s) => s.bestStreak >= 3 },
  { id: 'uke', name: 'Ukas utfordring', how: `${WEEKLY_GOAL} turer på én uke`, icon: 'star', test: (s) => s.bestWeek >= WEEKLY_GOAL },
  { id: 'maraton', name: 'Maraton', how: '42 km til sammen', icon: 'medal', test: (s) => s.km >= 42.195 },
  { id: 'bud', name: 'Budmester', how: 'Svar riktig på alle Finns bud', icon: 'shield', test: (s) => s.budSolved >= 10 },
];

function stats(trips, { budSolved = 0, now = new Date() } = {}) {
  const km = trips.reduce((s, t) => s + (Number(t.distanceM) || 0), 0) / 1000;
  const byDay = new Map();
  const byWeek = new Map();
  for (const t of trips) {
    const k = dayKey(t.createdAt);
    if (k) byDay.set(k, (byDay.get(k) || 0) + 1);
    const w = weekKey(t.createdAt);
    if (w) byWeek.set(w, (byWeek.get(w) || 0) + 1);
  }
  // Best streak ever (not just current).
  const days = [...byDay.keys()].sort();
  let bestStreak = 0; let run = 0; let prev = null;
  for (const d of days) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  }
  return {
    trips: trips.length,
    km,
    helmetTrips: trips.filter((t) => t.helmet).length,
    rainTrips: trips.filter((t) => t.weatherBonus).length,
    schoolTrips: trips.filter((t) => t.routeType === 'skole').length,
    longestM: trips.reduce((m, t) => Math.max(m, Number(t.distanceM) || 0), 0),
    bestStreak,
    streak: computeStreak(trips, now),
    thisWeek: byWeek.get(weekKey(now)) || 0,
    bestWeek: Math.max(0, ...byWeek.values()),
    budSolved,
  };
}

export function computeProgress(trips = [], opts = {}) {
  const s = stats(Array.isArray(trips) ? trips : [], opts);
  const badges = BADGES.map((b) => ({ id: b.id, name: b.name, how: b.how, icon: b.icon, earned: Boolean(b.test(s)) }));
  return {
    ...s,
    level: levelFor(s.trips),
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    weeklyGoal: WEEKLY_GOAL,
  };
}

// Badges present in `after` but not in `before` — for the celebration screen.
export function newBadges(before, after) {
  const had = new Set((before?.badges || []).filter((b) => b.earned).map((b) => b.id));
  return (after?.badges || []).filter((b) => b.earned && !had.has(b.id));
}
