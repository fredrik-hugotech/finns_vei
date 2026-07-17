import { isAdminRequest } from '../../../lib/backofficeAuth';
import { REPORT_STATUS } from '../../../lib/config';
import { REPORT_STATUS_ORDER } from '../../../lib/reportStatusMeta';
import { listReportsForStats, hasSupabaseConfig } from '../../../lib/supabaseRest';

// Bounded like other backoffice list endpoints (cases.js: 150, hot-cases:
// 300) — this one scans further back in history for aggregation, so the
// ceiling is higher, but it is still a ceiling, not "every report ever".
const MAX_ROWS = 2000;
const DAY_MS = 86400000;
const RANGE_DAYS = { 30: 30, 90: 90, 365: 365 };

function sinceForRangeDays(days) {
  if (!days) return null;
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function median(sortedAscendingSource) {
  if (!sortedAscendingSource.length) return null;
  const sorted = [...sortedAscendingSource].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function fmtShort(d) {
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function startOfWeek(d) {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function keyOf(d) {
  return d.toISOString().slice(0, 10);
}

// Buckets new-report volume into weeks (for shorter windows) or months (for
// longer ones), seeding every bucket in [from, to] with 0 first so gaps show
// up as empty bars rather than disappearing from the chart entirely.
function buildTrend(rows, { bucket, from, to }) {
  const bucketStart = bucket === 'month' ? startOfMonth : startOfWeek;
  const step = (d) => {
    const n = new Date(d);
    if (bucket === 'month') n.setMonth(n.getMonth() + 1);
    else n.setDate(n.getDate() + 7);
    return n;
  };

  const counts = new Map();
  const startAnchor = bucketStart(from);
  const endAnchor = bucketStart(to);
  for (let cur = new Date(startAnchor); cur <= endAnchor; cur = step(cur)) {
    counts.set(keyOf(cur), 0);
  }

  rows.forEach((r) => {
    if (!r.created_at) return;
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) return;
    const key = keyOf(bucketStart(d));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: fmtShort(new Date(key)), count }));
}

function categoryBreakdown(rows) {
  const counts = new Map();
  rows.forEach((r) => {
    const category = r.category || 'Annet';
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count }));
}

function statusBreakdown(rows) {
  const counts = new Map();
  rows.forEach((r) => {
    const status = r.status || REPORT_STATUS.NEW;
    counts.set(status, (counts.get(status) || 0) + 1);
  });
  const known = REPORT_STATUS_ORDER.map((status) => ({ status, count: counts.get(status) || 0 }));
  const other = [...counts.keys()]
    .filter((status) => !REPORT_STATUS_ORDER.includes(status))
    .map((status) => ({ status, count: counts.get(status) || 0 }));
  return [...known, ...other];
}

// Counts a nullable NVDB enrichment field (road_owner/road_category),
// tracking how many rows have no value separately — enrichment is best
// effort and can be missing for many reports, so that's shown, not hidden.
function nullableFieldBreakdown(rows, field) {
  const counts = new Map();
  let missing = 0;
  rows.forEach((r) => {
    const value = r[field];
    if (value === null || value === undefined || value === '') { missing += 1; return; }
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const items = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  return { items, missing };
}

// Days from created_at to status_updated_at for reports that are currently
// "Fullført" — status_updated_at is used as the completion timestamp per
// the Trello-webhook status sync documented in the README.
function resolutionStats(rows) {
  const days = rows
    .filter((r) => r.status === REPORT_STATUS.DONE && r.created_at && r.status_updated_at)
    .map((r) => (new Date(r.status_updated_at).getTime() - new Date(r.created_at).getTime()) / DAY_MS)
    .filter((d) => Number.isFinite(d) && d >= 0);
  if (!days.length) return { count: 0, avgDays: null, medianDays: null };
  const avg = days.reduce((a, b) => a + b, 0) / days.length;
  return { count: days.length, avgDays: round1(avg), medianDays: round1(median(days)) };
}

export default async function handler(req, res) {
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const rangeParam = typeof req.query.range === 'string' ? req.query.range : '90';
    const rangeDays = RANGE_DAYS[rangeParam] || null; // null => "all"
    const range = rangeDays ? String(rangeDays) : 'all';
    const since = sinceForRangeDays(rangeDays);

    const rows = await listReportsForStats({ since, limit: MAX_ROWS });

    const now = new Date();
    let from;
    if (rangeDays) {
      from = new Date(now.getTime() - rangeDays * DAY_MS);
    } else {
      // "All time": the row set is still capped at MAX_ROWS (newest first),
      // so for very large tables this is really "earliest of the most
      // recent MAX_ROWS", not the true first-ever report. Fine for this
      // app's scale; the `capped` flag below tells the UI to say so.
      const earliest = rows.reduce((min, r) => {
        if (!r.created_at) return min;
        const t = new Date(r.created_at).getTime();
        return min === null || t < min ? t : min;
      }, null);
      from = earliest !== null ? new Date(earliest) : now;
    }
    const bucket = rangeDays && rangeDays <= 120 ? 'week' : 'month';
    const trend = buildTrend(rows, { bucket, from, to: now });

    const roadOwner = nullableFieldBreakdown(rows, 'road_owner');
    const roadCategory = nullableFieldBreakdown(rows, 'road_category');

    return res.status(200).json({
      range,
      rangeDays,
      rowCount: rows.length,
      capped: rows.length >= MAX_ROWS,
      total: rows.length,
      totalSupport: rows.reduce((n, r) => n + Number(r.support_count || 0), 0),
      categories: categoryBreakdown(rows),
      statuses: statusBreakdown(rows),
      resolution: resolutionStats(rows),
      roadOwner,
      roadCategory,
      trend: { bucket, points: trend },
      // Flat, contact-info-free rows for the CSV export button — same data
      // the aggregates above are computed from, already period-filtered.
      reports: rows.map((r) => ({
        id: r.id,
        category: r.category,
        status: r.status,
        created_at: r.created_at,
        status_updated_at: r.status_updated_at,
        road_owner: r.road_owner,
        road_category: r.road_category,
        support_count: r.support_count,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Statistikk-feil' });
  }
}
