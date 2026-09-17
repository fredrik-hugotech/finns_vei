import routes from '../../../data/demo-routes.json';
import {
  getCompetition, hasSupabaseConfig, listBikeTripTokens, insertBikeTripRows,
  deleteNonImportedBikeTrips, setCompetitionClubs,
} from '../../../lib/supabaseRest';
import { clipPath, clipAndSnapCells, randomOffsetPoint, GRID_METERS } from '../../../lib/geoPrivacy';
import { classifyWeather } from '../../../lib/weather';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Imports the committed synthetic dataset (data/demo-routes.json, produced by
// .github/workflows/demo-routes.yml) into a DEMO competition.
//
// Safe to expose: it takes no data from the caller beyond a competition id,
// only writes into competitions flagged "demo", is idempotent (each trip
// carries a stable trip_token, already-imported ones are skipped) and is
// rate-limited. `?replace=1` additionally removes every trip in that
// competition that is not part of the current dataset (older seed runs and
// earlier generations).
export const config = { maxDuration: 120 };

const RATE_LIMIT = 6;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const BATCH = 80;

function isDemoComp(competition) {
  return /\bdemo\b/i.test(competition?.name || '') || /\bdemo\b/i.test(competition?.description || '');
}

function toRow(competitionId, trip, token) {
  const points = (trip.path || [])
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (points.length < 2) return null;
  // Same privacy treatment as a real upload: clip ~50 m around a randomly
  // offset stand-in for the start, snap the heatmap cells to the coarse grid.
  const homeRef = randomOffsetPoint(points[0]);
  const path = clipPath(points, { homeRef });
  if (path.length < 2) return null;
  const cells = clipAndSnapCells(points, { gridMeters: GRID_METERS, homeRef });
  const w = trip.weather || {};
  const precipMm = Number.isFinite(Number(w.precipMm)) ? Number(w.precipMm) : null;
  const { isPrecip } = classifyWeather(w.symbol || '', precipMm || 0);
  return {
    competition_id: competitionId,
    club: String(trip.club || '').trim() || null,
    helmet: Boolean(trip.helmet),
    distance_m: Math.round(Number(trip.distanceM) || 0),
    duration_s: Math.round(Number(trip.durationS) || 0),
    path_cells: cells,
    path,
    route_type: trip.routeType === 'skole' ? 'skole' : 'fritid',
    mode: trip.mode === 'gange' ? 'gange' : 'sykkel',
    weather_symbol: w.symbol || null,
    precip_mm: precipMm,
    temp_c: Number.isFinite(Number(w.tempC)) ? Number(w.tempC) : null,
    weather_bonus: isPrecip,
    trip_token: token,
    created_at: trip.createdAt || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'demo-import', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk' });
  }
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Ikke konfigurert' });

  const competitionId = String(req.query.competitionId || '');
  if (!competitionId) return res.status(400).json({ error: 'Mangler competitionId' });
  if (!routes?.generatedAt || !Array.isArray(routes.trips) || !routes.trips.length) {
    return res.status(409).json({ error: 'data/demo-routes.json er tom – kjør workflowen «Generer demo-ruter» først' });
  }

  try {
    const competition = await getCompetition(competitionId);
    if (!competition || !isDemoComp(competition)) return res.status(404).json({ error: 'Fant ikke demo-konkurransen' });

    let deleted = false;
    if (req.query.replace === '1') {
      await deleteNonImportedBikeTrips(competitionId, `demo-import:${routes.generatedAt}`);
      deleted = true;
    }
    const existing = await listBikeTripTokens(competitionId);
    const rows = [];
    let skipped = 0;
    routes.trips.forEach((trip, i) => {
      const token = `demo-import:${routes.generatedAt}:${i}`;
      if (existing.has(token)) { skipped += 1; return; }
      const row = toRow(competitionId, trip, token);
      if (row) rows.push(row);
    });
    for (let i = 0; i < rows.length; i += BATCH) {
      await insertBikeTripRows(rows.slice(i, i + BATCH));
    }
    const clubs = Array.isArray(routes.clubs) && routes.clubs.length ? routes.clubs : [];
    if (clubs.length) await setCompetitionClubs(competitionId, clubs);

    return res.status(200).json({
      ok: true,
      competition: competition.name,
      generatedAt: routes.generatedAt,
      inserted: rows.length,
      skipped,
      deletedOld: deleted,
      clubs: clubs.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Import feilet' });
  }
}
