import { createBikeTrip, getCompetition, hasSupabaseConfig } from '../../lib/supabaseRest';
import { pathDistanceMeters } from '../../lib/geoPrivacy';
import { checkRequestRateLimit } from '../../lib/rateLimit';
import { normalizeMode } from '../../lib/tripModes';

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
// A route drawn on the map by an adult (source: 'manuell') has no duration;
// its distance is recomputed here from the drawn line instead of trusted.
const MAX_DRAWN_ROUTE_M = 50000; // 50 km
const MAX_DRAWN_ROUTE_POINTS = 3000;

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

  const body = req.body || {};
  const source = body.source === 'manuell' ? 'manuell' : 'live';
  // Self-declared on the device ("Hvem logger?"): a child aged 13+ or
  // an adult. Children under 13 never log on their own. Older cached
  // clients and queued trips send nothing — accepted as unknown (null).
  const loggedBy = source === 'manuell' ? 'voksen' : (body.loggedBy === 'barn13' || body.loggedBy === 'voksen' ? body.loggedBy : null);

  if (source === 'manuell') {
    // Drawn routes describe a regular way to training/school — they feed the
    // heatmap but never count in a competition.
    const points = Array.isArray(body.path)
      ? body.path.map((p) => ({ lng: Number(p?.[0]), lat: Number(p?.[1]) })).filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
      : [];
    if (points.length < 2 || points.length > MAX_DRAWN_ROUTE_POINTS) return res.status(400).json({ error: 'Ugyldig rute' });
    const distance = pathDistanceMeters(points);
    if (!(distance > 0) || distance > MAX_DRAWN_ROUTE_M) return res.status(400).json({ error: 'Ruten er for lang' });
    try {
      await createBikeTrip({
        competitionId: null,
        club: null,
        helmet: false,
        distanceM: distance,
        durationS: null,
        cells: points.map((p) => [p.lng, p.lat]),
        path: body.path,
        routeType: body.routeType || null,
        mode: normalizeMode(body.mode),
        weather: null,
        tripToken: body.tripToken || null,
        source,
        loggedBy,
      });
      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunne ikke lagre ruten' });
    }
  }

  const { competitionId, club, helmet, distanceM, durationS, cells, path, routeType, mode, weather, tripToken } = body;

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
    // No competition is fine: the trip still counts in the map of where
    // children travel, just not on any leaderboard.
    let clubName = '';
    if (competitionId) {
      const competition = await getCompetition(competitionId);
      if (!competition || !competition.active) {
        return res.status(404).json({ error: 'Konkurransen er ikke aktiv' });
      }
      clubName = String(club || '').trim();
      const matchedClub = competition.clubs.find((entry) => entry.name === clubName);
      if (competition.clubs.length && !matchedClub) {
        return res.status(400).json({ error: 'Velg en klubb fra listen' });
      }
    }

    await createBikeTrip({
      competitionId: competitionId || null,
      club: clubName,
      helmet: Boolean(helmet),
      distanceM,
      durationS,
      cells: Array.isArray(cells) ? cells : [],
      path: Array.isArray(path) ? path : [],
      routeType: routeType || null,
      mode: normalizeMode(mode),
      weather: weather && typeof weather === 'object' ? weather : null,
      tripToken: tripToken || null,
      source,
      loggedBy,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lagre sykkelturen' });
  }
}
