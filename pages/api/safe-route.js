// "Tryggeste skolevei": suggest a few candidate walk/cycle routes between two
// points and score each by proximity to (a) existing public hazard reports
// and (b) NVDB accident history sampled along the route — connecting the two
// pillars (citizen reports + NVDB) that previously only ever showed up
// side-by-side on the same map, never combined into a recommendation.
//
// Privacy: this endpoint never reads or stores raw GPS trip data. The route
// geometry it scores comes straight back from the Mapbox Directions API (a
// generic routing result for the two points the user picked just now, not a
// stored trip), and the hazard signal is the already-public report dataset
// (GET /api/reports). See the "Tryggeste skolevei" section in README.md.
import { getAccidentSummary } from '../../lib/nvdb';
import { getPublicReportGeoJson, hasSupabaseConfig } from '../../lib/supabaseRest';
import {
  ACCIDENT_SAMPLE_RADIUS_M,
  MAX_ACCIDENT_SAMPLES_PER_ROUTE,
  accidentSeverityWeightedCount,
  classifyRisk,
  combineRiskScore,
  sampleEvenlyByDistance,
  scoreRouteHazards,
} from '../../lib/safeRoute';

// Allow a bit more than the Vercel Hobby default (10s) since this handler
// makes a Mapbox Directions call followed by several NVDB lookups; ignored
// on plans/runtimes that don't support per-route duration config.
export const config = { maxDuration: 30 };

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MAPBOX_PROFILES = { sykkel: 'cycling', gange: 'walking' };
const DIRECTIONS_TIMEOUT_MS = 6000;
// Wall-clock budget for the whole NVDB accident-scoring stage across all
// routes/samples combined. If NVDB is slow or unavailable we still return
// hazard-only scored routes rather than making the whole request hang or
// fail — see the try/catch + race below. Kept short so the combined request
// (Directions + this stage) stays well inside typical serverless duration
// limits even when NVDB is completely unresponsive.
const ACCIDENT_STAGE_TIMEOUT_MS = 6000;

function log(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/safe-route', event, ...details }));
}

function isFiniteCoord(point) {
  return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng));
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function withTimeout(promise, ms, fallbackValue) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(fallbackValue), ms); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDirectionRoutes({ start, destination, profile }) {
  const coordString = `${start.lng},${start.lat};${destination.lng},${destination.lat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordString}`
    + `?alternatives=true&geometries=geojson&overview=full&steps=false&access_token=${MAPBOX_TOKEN}`;
  const response = await fetchWithTimeout(url, DIRECTIONS_TIMEOUT_MS);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || `Mapbox Directions svarte ${response.status}`;
    const error = new Error(message);
    error.status = response.status === 422 ? 400 : 502;
    throw error;
  }
  return Array.isArray(body.routes) ? body.routes : [];
}

// Best-effort accident scoring for one route: samples a handful of evenly
// spaced points along the geometry and looks each up against NVDB. A single
// failed sample just contributes 0 (never throws), so one flaky NVDB call
// never sinks the whole route's score.
async function scoreRouteAccidents(coords) {
  const samples = sampleEvenlyByDistance(coords, MAX_ACCIDENT_SAMPLES_PER_ROUTE);
  const results = await Promise.allSettled(samples.map(([lng, lat]) => (
    getAccidentSummary({ lat, lng, radiusMeters: ACCIDENT_SAMPLE_RADIUS_M })
  )));
  let score = 0;
  let accidentCount = 0;
  let anySucceeded = false;
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    anySucceeded = true;
    score += accidentSeverityWeightedCount(result.value);
    accidentCount += Number(result.value.accident_count || 0);
  }
  return { score, accidentCount, sampleCount: samples.length, anySucceeded };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!MAPBOX_TOKEN) {
    return res.status(500).json({ error: 'Mapbox-token mangler på serveren (NEXT_PUBLIC_MAPBOX_TOKEN).' });
  }

  const { start, destination, mode } = req.body || {};
  if (!isFiniteCoord(start) || !isFiniteCoord(destination)) {
    return res.status(400).json({ error: 'start og destination må ha gyldig lat/lng.' });
  }

  const travelMode = MAPBOX_PROFILES[mode] ? mode : 'sykkel';
  const profile = MAPBOX_PROFILES[travelMode];

  let rawRoutes;
  try {
    rawRoutes = await fetchDirectionRoutes({
      start: { lat: Number(start.lat), lng: Number(start.lng) },
      destination: { lat: Number(destination.lat), lng: Number(destination.lng) },
      profile,
    });
  } catch (error) {
    log('directions_failed', { message: String(error?.message || '').slice(0, 300), name: error?.name });
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Mapbox Directions svarte ikke i tide. Prøv igjen.' });
    }
    return res.status(error?.status || 502).json({ error: error?.message || 'Kunne ikke hente ruteforslag fra Mapbox.' });
  }

  if (!rawRoutes.length) {
    return res.status(200).json({ routes: [], meta: { mode: travelMode, reason: 'no_route_found' } });
  }

  // Mapbox alternatives=true does not always return more than one route —
  // in smaller road networks (typical for a Norwegian residential area) it
  // very often returns just one. That's fine: we still score and present it.
  const candidateRoutes = rawRoutes.slice(0, 3);

  let hazardFeatures = [];
  try {
    if (hasSupabaseConfig()) {
      const geojson = await getPublicReportGeoJson();
      hazardFeatures = geojson.features || [];
    }
  } catch (error) {
    log('hazard_fetch_failed', { message: String(error?.message || '').slice(0, 300) });
    hazardFeatures = []; // graceful: score on accidents only rather than failing the request
  }

  const hazardResults = candidateRoutes.map((route) => scoreRouteHazards(route.geometry.coordinates, hazardFeatures));

  let accidentResults = candidateRoutes.map(() => ({ score: 0, accidentCount: 0, sampleCount: 0, anySucceeded: false }));
  let nvdbAvailable = true;
  try {
    const stageResult = await withTimeout(
      Promise.all(candidateRoutes.map((route) => scoreRouteAccidents(route.geometry.coordinates))),
      ACCIDENT_STAGE_TIMEOUT_MS,
      null,
    );
    if (stageResult) {
      accidentResults = stageResult;
      nvdbAvailable = accidentResults.some((r) => r.anySucceeded) || candidateRoutes.length === 0;
    } else {
      nvdbAvailable = false;
      log('accident_stage_timed_out', { candidateCount: candidateRoutes.length });
    }
  } catch (error) {
    nvdbAvailable = false;
    log('accident_stage_failed', { message: String(error?.message || '').slice(0, 300) });
  }

  const scoredRoutes = candidateRoutes.map((route, index) => {
    const hazard = hazardResults[index];
    const accident = accidentResults[index];
    const riskScore = combineRiskScore({
      hazardScore: hazard.score,
      accidentScore: accident.score,
      distanceM: route.distance,
    });
    return {
      id: `route-${index}`,
      distanceM: Math.round(route.distance),
      durationS: Math.round(route.duration),
      geometry: route.geometry,
      hazardScore: Number(hazard.score.toFixed(2)),
      hazardCount: hazard.count,
      accidentScore: Number(accident.score.toFixed(2)),
      accidentCount: accident.accidentCount,
      riskScore: Number(riskScore.toFixed(2)),
      riskLevel: classifyRisk(riskScore),
    };
  });

  scoredRoutes.sort((a, b) => (a.riskScore - b.riskScore) || (a.durationS - b.durationS));
  const recommendedId = scoredRoutes[0]?.id || null;
  const routesWithFlag = scoredRoutes.map((route) => ({ ...route, recommended: route.id === recommendedId }));

  log('scored', {
    mode: travelMode,
    routeCount: routesWithFlag.length,
    hazardFeatureCount: hazardFeatures.length,
    nvdbAvailable,
    recommendedId,
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    routes: routesWithFlag,
    recommendedId,
    meta: {
      mode: travelMode,
      hazardSignalAvailable: hazardFeatures.length > 0,
      nvdbAvailable,
    },
  });
}
