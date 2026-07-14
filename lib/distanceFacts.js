// Small, pure helpers for turning a raw distance total into a fun,
// human-scale comparison ("klubbmil-fakta") for the competition sheet.
//
// Reference distances are hardcoded, real-world approximations - kept
// deliberately simple and easily verifiable rather than "cute but wrong".

// Standard football (soccer) pitch touchline length is ~100-110m
// (FIFA recommends 105m for international matches). Approximate.
export const FOOTBALL_PITCH_LAP_M = 105;

// Road distance Oslo-Bergen via E16 is commonly cited as ~463 km.
// Approximate - varies a bit by exact route/start/end point.
export const OSLO_BERGEN_ROAD_M = 463000;

// Above this many meters, counting "laps of a football pitch" stops being
// a flattering/meaningful comparison (100+ laps), so we switch to the
// Oslo-Bergen comparison instead.
const SMALL_LARGE_THRESHOLD_M = FOOTBALL_PITCH_LAP_M * 100; // ~10.5 km

/**
 * Given a total distance in meters, pick the most fitting fun comparison.
 * Returns null when the total is missing/zero/invalid, so callers can
 * skip rendering a nonsensical "0 ganger ..." line.
 *
 * @param {number} totalMeters
 * @returns {string|null}
 */
export function pickDistanceFact(totalMeters) {
  const meters = Number(totalMeters);
  if (!Number.isFinite(meters) || meters <= 0) return null;

  if (meters < SMALL_LARGE_THRESHOLD_M) {
    const laps = Math.max(1, Math.round(meters / FOOTBALL_PITCH_LAP_M));
    const noun = laps === 1 ? 'gang' : 'ganger';
    return `${laps.toLocaleString('nb-NO')} ${noun} rundt en fotballbane`;
  }

  const ratio = meters / OSLO_BERGEN_ROAD_M;
  if (ratio < 1) {
    const pct = ratio * 100;
    const pctText = pct < 10 ? pct.toFixed(1) : Math.round(pct).toString();
    return `${pctText.replace('.', ',')}% av veien fra Oslo til Bergen`;
  }

  const multiple = ratio.toFixed(1).replace('.', ',');
  return `${multiple} ganger strekningen Oslo–Bergen`;
}
