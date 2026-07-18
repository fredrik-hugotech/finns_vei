// Recurring hotspot / seasonal-pattern analysis for backoffice staff.
//
// Distinct from `listHotCases` (lib/supabaseRest.js), which ranks currently
// OPEN cases by a "heat" score (support_count + concern diversity) — a
// snapshot of what's loud right now. This module instead looks across a
// location's *whole* report history (any status, any age) to tell chronic
// problem spots (reports recurring across several different seasons/years)
// apart from a spot that simply got a lot of reports in one short burst
// (e.g. one bad week right after a pothole appeared) — a different, less
// "this deserves municipal investment" kind of signal.
//
// Also distinct from the ~35 m `CASE_GROUP_RADIUS_M` case-grouping radius
// (lib/reportWorkflow.js), which links a *new* report to an already-open
// Trello case so staff don't get a duplicate card while a case is being
// worked. That radius is intentionally tight and only looks at currently
// open cases at the moment a new report comes in. This pass runs over the
// full report history (any status) with a somewhat wider radius: two
// reports about "the crossing by the school" from different citizens a
// season — or several years — apart tend to drift a bit more in exact
// tapped coordinates than two reports about the literal same live case do.
//
// There is no PostGIS/spatial extension in this project — lib/supabaseRest.js
// talks to Supabase purely over PostgREST — so clustering happens here in
// plain JS, using the same haversine distance helper the bike-trip privacy
// code already relies on (`distanceMeters` from lib/geoPrivacy.js). No new
// dependency is introduced.

import { distanceMeters } from './geoPrivacy';

// Wider than the 35 m case-grouping radius on purpose: this pass groups
// "same general spot, reported over a long time span" rather than "same
// live case right now", so a bit more spatial slack is appropriate — roughly
// 2x the case-grouping radius. Tune with HOTSPOT_RADIUS_M per municipality
// density if needed; documented here rather than in README prose only.
export const DEFAULT_HOTSPOT_RADIUS_M = Number(process.env.HOTSPOT_RADIUS_M || 75);

// A spot only counts as a "recurring hotspot" once it has been reported in
// at least this many distinct time periods (see `seasonPeriod` below) — a
// single busy period alone is a burst, not a pattern, even if it produced
// many reports.
export const DEFAULT_MIN_PERIODS = Number(process.env.HOTSPOT_MIN_PERIODS || 2);

const SEASON_LABELS = { vinter: 'vinter', var: 'vår', sommer: 'sommer', host: 'høst' };

// Meteorological (Norwegian) seasons rather than raw year-month buckets:
// December is grouped with the FOLLOWING January/February as one winter, so
// reports in Dec + Jan + Feb of the same winter count as ONE period, not up
// to three. This keeps "recurring across seasons/years" meaning what it
// says: a spot busy for one entire winter is still a single burst, while a
// spot hit every winter for three years running is genuinely chronic.
// Known limitation: a spot reported once in late autumn and once in early
// winter (a few weeks apart, but crossing the season boundary) still counts
// as 2 distinct periods — see README for this tradeoff.
export function seasonPeriod(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getUTCMonth() + 1; // 1-12
  const year = d.getUTCFullYear();
  let season;
  let seasonYear = year;
  if (month === 12) {
    season = 'vinter';
    seasonYear = year + 1;
  } else if (month <= 2) {
    season = 'vinter';
  } else if (month <= 5) {
    season = 'var';
  } else if (month <= 8) {
    season = 'sommer';
  } else {
    season = 'host';
  }
  const key = `${seasonYear}-${season}`;
  return { key, year: seasonYear, season, label: `${SEASON_LABELS[season]} ${seasonYear}` };
}

function toPoint(report) {
  const lat = Number(report?.lat);
  const lng = Number(report?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// Greedy single-pass spatial clustering: walk reports in chronological order
// and attach each one to the *nearest* existing cluster within `radiusM`,
// otherwise start a new cluster there. This intentionally avoids adding a
// clustering library dependency (no k-means/DBSCAN package) and reuses the
// same haversine-distance approach as the case-grouping radius.
//
// Known limitation (first version): this is greedy and order-dependent, and
// a cluster's centroid re-centers (running mean) as members are added, so it
// can drift a little over a long, spatially loose sequence of reports rather
// than staying pinned to the first report's exact point. That's an
// acceptable tradeoff for a "which spots deserve a closer look" triage tool,
// not a survey-grade spatial statistic.
export function clusterReportsByLocation(reports, { radiusM = DEFAULT_HOTSPOT_RADIUS_M } = {}) {
  const valid = (reports || [])
    .map((report) => {
      const point = toPoint(report);
      const createdAt = report?.created_at ? new Date(report.created_at) : null;
      if (!point || !createdAt || Number.isNaN(createdAt.getTime())) return null;
      return { report, point, createdAt };
    })
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt);

  const clusters = [];
  for (const entry of valid) {
    let best = null;
    let bestDist = Infinity;
    for (const cluster of clusters) {
      const dist = distanceMeters(cluster.center, entry.point);
      if (dist <= radiusM && dist < bestDist) {
        best = cluster;
        bestDist = dist;
      }
    }
    if (best) {
      best.members.push(entry);
      const n = best.members.length;
      // Running mean centroid update.
      best.center = {
        lat: best.center.lat + (entry.point.lat - best.center.lat) / n,
        lng: best.center.lng + (entry.point.lng - best.center.lng) / n,
      };
    } else {
      clusters.push({ center: { ...entry.point }, members: [entry] });
    }
  }
  return clusters;
}

function dominantCategory(members) {
  const counts = new Map();
  for (const m of members) {
    const cat = m.report?.category || 'Ukjent';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  const breakdown = Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  return { dominant: breakdown[0]?.category || 'Ukjent', breakdown };
}

function statusMix(members) {
  const counts = new Map();
  for (const m of members) {
    const status = m.report?.status || 'Ukjent';
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

// Turn one spatial cluster into the summary shape the API/page consumes.
export function summarizeCluster(cluster) {
  const members = cluster.members;
  const periodByKey = new Map();
  for (const m of members) {
    const period = seasonPeriod(m.createdAt);
    if (period) periodByKey.set(period.key, period);
  }
  const periods = Array.from(periodByKey.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const createdTimes = members.map((m) => m.createdAt.getTime());
  const { dominant, breakdown } = dominantCategory(members);

  return {
    center: { lat: Number(cluster.center.lat.toFixed(6)), lng: Number(cluster.center.lng.toFixed(6)) },
    reportCount: members.length,
    periodCount: periods.length,
    periods: periods.map((p) => p.label),
    firstSeen: new Date(Math.min(...createdTimes)).toISOString(),
    lastSeen: new Date(Math.max(...createdTimes)).toISOString(),
    dominantCategory: dominant,
    categoryBreakdown: breakdown,
    statusMix: statusMix(members),
    reportIds: members.map((m) => (m.report?.id ?? null)).filter((id) => id !== null),
  };
}

// Full pipeline: cluster -> summarize -> keep only genuinely recurring spots
// (touching at least `minPeriods` distinct seasons/years) -> rank by
// recurrence first (distinct periods), not raw report count, since a spot
// with 6 reports across 3 different years is a stronger chronic signal than
// 10 reports from one bad week.
export function buildHotspotOverview(reports, { radiusM = DEFAULT_HOTSPOT_RADIUS_M, minPeriods = DEFAULT_MIN_PERIODS } = {}) {
  const clusters = clusterReportsByLocation(reports, { radiusM });
  const hotspots = clusters
    .map(summarizeCluster)
    .filter((h) => h.periodCount >= minPeriods)
    .sort((a, b) => (
      b.periodCount - a.periodCount
      || b.reportCount - a.reportCount
      || new Date(b.lastSeen) - new Date(a.lastSeen)
    ));
  return hotspots.map((h, index) => ({ rank: index + 1, ...h }));
}
