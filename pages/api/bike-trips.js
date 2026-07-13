import { createBikeTrip, getCompetition, hasSupabaseConfig } from '../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../lib/rateLimit';
import { fetchWeatherForLocation } from '../../lib/weather';

// ~15 trip logs per 10 minutes per IP hash - a class of kids sharing one
// gym/school wifi can log several trips in a row without tripping this.
const RATE_LIMIT = 15;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Plausibility bounds for a single logged trip, so one fabricated submission
// can't dominate a `metric: 'distance'` leaderboard. Generous enough for a
// real e-bike/downhill ride, but rules out obviously implausible numbers.
const MAX_TRIP_DISTANCE_M = 150000; // 150 km
const MAX_TRIP_DURATION_S = 43200; // 12 h
const MAX_TRIP_SPEED_MPS = 20; // ~72 km/h

function logApi(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/bike-trips', event, ...details }));
}

// Both `path` and `cells` are already privacy-clipped/grid-snapped on the
// device (see lib/geoPrivacy.js) — the first entry is a fine, already-safe
// approximate location for a weather lookup, no exact home position involved.
function firstApproxLocation(...lists) {
  for (const list of lists) {
    if (!Array.isArray(list) || !list.length) continue;
    const first = list[0];
    const lng = Array.isArray(first) ? Number(first[0]) : Number(first?.lng);
    const lat = Array.isArray(first) ? Number(first[1]) : Number(first?.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lat, lng };
  }
  return null;
}

// The "Værhelt" (weather hero) badge and competition tie-break must not be
// gameable by simply POSTing `weather: { bonus: true }` — so the bonus is
// always recomputed server-side from the trip's approximate location via the
// same MET Norway lookup used by /api/weather, never trusted from the client.
// Best-effort / fail-safe: no location or a failed lookup just means no
// bonus, same resilience pattern as NVDB enrichment — never blocks the trip.
async function resolveWeatherBonus(cleanPath, cleanCells) {
  const point = firstApproxLocation(cleanPath, cleanCells);
  if (!point) return false;
  try {
    const result = await fetchWeatherForLocation(point.lat, point.lng);
    return Boolean(result?.ok && result.isPrecip);
  } catch (_e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'bike-trips', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    logApi('rate_limited', { retryAfterMs: rateLimit.retryAfterMs });
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Ikke konfigurert' });
  }

  const { competitionId, club, helmet, distanceM, durationS, cells, path, routeType, mode, weather, tripToken } = req.body || {};

  if (!competitionId) return res.status(400).json({ error: 'Mangler konkurranse' });

  const distanceNum = Number(distanceM);
  const durationNum = Number(durationS);
  if (Number.isFinite(distanceNum) && (distanceNum < 0 || distanceNum > MAX_TRIP_DISTANCE_M)) {
    return res.status(400).json({ error: 'Ugyldig distanse' });
  }
  if (Number.isFinite(durationNum) && (durationNum < 0 || durationNum > MAX_TRIP_DURATION_S)) {
    return res.status(400).json({ error: 'Ugyldig varighet' });
  }
  if (Number.isFinite(distanceNum) && Number.isFinite(durationNum) && durationNum > 0 && (distanceNum / durationNum) > MAX_TRIP_SPEED_MPS) {
    return res.status(400).json({ error: 'Ugyldig fart' });
  }

  try {
    const competition = await getCompetition(competitionId);
    if (!competition || !competition.active) {
      return res.status(404).json({ error: 'Konkurransen er ikke aktiv' });
    }

    const clubName = String(club || '').trim();
    const matchedClub = competition.clubs.find((entry) => entry.name === clubName);
    if (competition.clubs.length && !matchedClub) {
      return res.status(400).json({ error: 'Velg en klubb fra listen' });
    }

    const cleanCells = Array.isArray(cells) ? cells : [];
    const cleanPath = Array.isArray(path) ? path : [];
    const weatherPayload = weather && typeof weather === 'object' ? weather : null;
    // Never trust the client-submitted bonus flag - recompute it authoritatively.
    const weatherBonus = await resolveWeatherBonus(cleanPath, cleanCells);

    await createBikeTrip({
      competitionId,
      club: clubName,
      helmet: Boolean(helmet),
      distanceM,
      durationS,
      cells: cleanCells,
      path: cleanPath,
      routeType: routeType || null,
      mode: mode === 'gange' ? 'gange' : 'sykkel',
      weather: { ...(weatherPayload || {}), bonus: weatherBonus },
      tripToken: tripToken || null,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lagre sykkelturen' });
  }
}
