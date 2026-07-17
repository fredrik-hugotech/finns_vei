// Scoring helpers for "Tryggeste skolevei" (pages/api/safe-route.js).
//
// Philosophy: reuse the exact same "how concerning is this hazard report"
// weighting already used for the public Bekymringsgrad heatmap
// (lib/mapStyleConfig.js) instead of inventing a new scale, and reuse the
// same fatal/serious severity multipliers already used for the accident
// heatmap paint. This file only does pure, synchronous scoring math — the
// network calls (Mapbox Directions, Supabase reports, NVDB accidents) stay
// in the API route so this stays easy to reason about and reuse.
import { distanceMeters as distanceMetersLatLng } from './geoPrivacy';
import {
  CONCERN_HEATMAP_DEFAULT_WEIGHTS,
  CONCERN_HEATMAP_DEFAULT_OTHER_WEIGHT,
  CONCERN_HEATMAP_DEFAULT_SUPPORT_BOOST_FACTOR,
  CONCERN_HEATMAP_SUPPORT_BOOST_CAP,
} from './mapStyleConfig';

function numericEnv(name, fallback) {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

// How close (metres) a hazard report / accident sample needs to be to a
// route to count at all. Both optionally tunable via env, same pattern as
// the NVDB_* radii in lib/nvdb.js — neither is required for the feature to
// work, they just let a deploy tune sensitivity without a code change.
export const HAZARD_PROXIMITY_RADIUS_M = numericEnv('SAFE_ROUTE_HAZARD_RADIUS_M', 40);
export const ACCIDENT_SAMPLE_RADIUS_M = numericEnv('SAFE_ROUTE_ACCIDENT_RADIUS_M', 40);
export const MAX_ACCIDENT_SAMPLES_PER_ROUTE = 5;

// Relative weight of a registered NVDB accident vs. a citizen hazard report
// in the combined score — an accident is a confirmed past event, so it
// counts for more than a reported concern.
export const HAZARD_SCORE_WEIGHT = 1;
export const ACCIDENT_SCORE_WEIGHT = 2;

// Mirrors MAP_STYLE.accidentHeatmapPaint's 'heatmap-weight' severity
// multipliers in lib/mapStyleConfig.js (fatal 2x, serious 1.5x) so accident
// severity is read the same way on both the map and here.
const ACCIDENT_SEVERITY_WEIGHT = { fatal: 2, serious: 1.5, minor: 1, unknown: 1 };

function distanceLngLat(a, b) {
  return distanceMetersLatLng({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] });
}

// Same shape as buildConcernHeatmapWeightExpression in lib/mapStyleConfig.js
// (category severity x support_count boost) but evaluated in plain JS
// against a single report instead of as a Mapbox GL paint expression.
export function concernWeightForReport(properties = {}) {
  const category = properties.category;
  const supportCount = Number(properties.support_count || 0) || 0;
  const categoryWeight = Object.prototype.hasOwnProperty.call(CONCERN_HEATMAP_DEFAULT_WEIGHTS, category)
    ? CONCERN_HEATMAP_DEFAULT_WEIGHTS[category]
    : CONCERN_HEATMAP_DEFAULT_OTHER_WEIGHT;
  const boost = 1 + CONCERN_HEATMAP_DEFAULT_SUPPORT_BOOST_FACTOR * Math.min(supportCount, CONCERN_HEATMAP_SUPPORT_BOOST_CAP);
  return categoryWeight * boost;
}

// Picks up to `maxSamples` points spread evenly by distance along an ordered
// [lng,lat] coordinate list (a Mapbox Directions route geometry). Used to
// keep NVDB accident-lookup call volume bounded regardless of route length.
export function sampleEvenlyByDistance(coords = [], maxSamples = 5) {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  if (coords.length <= maxSamples) return coords;

  const cumulative = [0];
  for (let i = 1; i < coords.length; i += 1) {
    cumulative.push(cumulative[i - 1] + distanceLngLat(coords[i - 1], coords[i]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return [coords[0]];

  const samples = [];
  const steps = Math.max(maxSamples - 1, 1);
  for (let i = 0; i < maxSamples; i += 1) {
    const targetDistance = (total * i) / steps;
    let idx = cumulative.findIndex((d) => d >= targetDistance);
    if (idx === -1) idx = coords.length - 1;
    samples.push(coords[idx]);
  }
  return samples.filter((point, i) => (
    i === 0 || point[0] !== samples[i - 1][0] || point[1] !== samples[i - 1][1]
  ));
}

function boundingBox(coords = [], paddingM = 0) {
  let minLng = Infinity; let minLat = Infinity; let maxLng = -Infinity; let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return null;
  const midLat = (minLat + maxLat) / 2;
  const dLat = paddingM / 111320;
  const dLng = paddingM / (111320 * Math.cos((midLat * Math.PI) / 180) || 111320);
  return { minLng: minLng - dLng, minLat: minLat - dLat, maxLng: maxLng + dLng, maxLat: maxLat + dLat };
}

function withinBoundingBox(lng, lat, bbox) {
  return Boolean(bbox) && lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat;
}

// Approximates the distance from a point to the route as the minimum
// distance to any vertex of the route geometry. Mapbox's `overview=full`
// geometry is dense along real road networks, so for the tens-of-metres
// proximity radii used here this tracks true point-to-line distance closely
// enough — a full point-to-segment projection isn't needed for a v1.
export function minDistanceToRouteVertices(point, coords = []) {
  let min = Infinity;
  for (const candidate of coords) {
    const d = distanceLngLat(point, candidate);
    if (d < min) min = d;
    if (min === 0) break;
  }
  return min;
}

// Sums concern-weighted proximity of every hazard report within
// `radiusM` of the route (linear falloff: 1 right on the route, 0 at the
// radius edge), pre-filtering with a cheap bounding-box check first so this
// stays fast even with a few hundred reports.
export function scoreRouteHazards(coords, reportFeatures = [], radiusM = HAZARD_PROXIMITY_RADIUS_M) {
  const bbox = boundingBox(coords, radiusM);
  let score = 0;
  const nearby = [];
  for (const feature of reportFeatures) {
    const point = feature?.geometry?.coordinates;
    if (!Array.isArray(point) || point.length < 2) continue;
    const [lng, lat] = point;
    if (!withinBoundingBox(lng, lat, bbox)) continue;
    const dist = minDistanceToRouteVertices(point, coords);
    if (dist > radiusM) continue;
    const proximity = Math.max(0, 1 - dist / radiusM);
    const weight = concernWeightForReport(feature.properties || {});
    score += weight * proximity;
    nearby.push({ id: feature.properties?.id || feature.id || null, category: feature.properties?.category || null, distanceM: Math.round(dist) });
  }
  return { score, count: nearby.length, nearby };
}

// Turns an NVDB getAccidentSummary() result into a single severity-weighted
// number (falls back to the plain accident_count when no severity breakdown
// is available).
export function accidentSeverityWeightedCount(summary) {
  const counts = summary?.accident_summary?.severity_counts;
  if (!counts) return Number(summary?.accident_count || 0);
  return Object.entries(counts).reduce(
    (sum, [severity, count]) => sum + (ACCIDENT_SEVERITY_WEIGHT[severity] ?? 1) * Number(count || 0),
    0,
  );
}

// Combines hazard + accident signal into one risk-per-km score so routes of
// different lengths stay comparable (a longer route isn't unfairly punished
// just for having more geometry to sample).
export function combineRiskScore({ hazardScore, accidentScore, distanceM }) {
  const distanceKm = Math.max(Number(distanceM || 0) / 1000, 0.15);
  return (hazardScore * HAZARD_SCORE_WEIGHT + accidentScore * ACCIDENT_SCORE_WEIGHT) / distanceKm;
}

// Tunable, fixed thresholds — this is a v1 heuristic, not a calibrated model.
export function classifyRisk(riskScore) {
  if (!Number.isFinite(riskScore) || riskScore <= 0) return 'lav';
  if (riskScore <= 2) return 'lav';
  if (riskScore <= 5) return 'middels';
  return 'høy';
}

export const RISK_LEVEL_LABELS = {
  lav: 'Lav risiko',
  middels: 'Middels risiko',
  høy: 'Høy risiko',
};
