import { createBikeTrip, getCompetition, hasSupabaseConfig } from '../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../lib/rateLimit';

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
// A trip longer than this needs a real (positive) duration, so the speed
// check below can't be bypassed by sending a large distanceM with
// durationS: 0 or omitted entirely.
const MIN_DISTANCE_FOR_DURATION_CHECK_M = 300;

function logApi(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/bike-trips', event, ...details }));
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
  if (Number.isFinite(distanceNum) && distanceNum > MIN_DISTANCE_FOR_DURATION_CHECK_M && !(Number.isFinite(durationNum) && durationNum > 0)) {
    return res.status(400).json({ error: 'Ugyldig fart' });
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

    await createBikeTrip({
      competitionId,
      club: clubName,
      helmet: Boolean(helmet),
      distanceM,
      durationS,
      cells: Array.isArray(cells) ? cells : [],
      path: Array.isArray(path) ? path : [],
      routeType: routeType || null,
      mode: mode === 'gange' ? 'gange' : 'sykkel',
      weather: weather && typeof weather === 'object' ? weather : null,
      tripToken: tripToken || null,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lagre sykkelturen' });
  }
}
