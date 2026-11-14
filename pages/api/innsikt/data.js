import { insightAccess } from '../../../lib/insightAuth';
import { getInsightReportRows, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { splitReportText } from '../../../lib/reportText';
import { FYLKER } from '../../../lib/fylker';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Aggregated figures for the insight dashboard. Only counts leave the server:
// no descriptions, names or contact details. Map points are rounded to ~100 m.
const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

function osloParts(iso) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
}

function topN(map, n) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
}

function build(rows) {
  const now = Date.now();
  const total = rows.length;
  const byDay = new Map();
  const byHourOfDay = Array(24).fill(0);
  const last48 = new Map();
  const fylker = new Map();
  const kommuner = new Map();
  const concerns = new Map();
  const mainCategory = new Map();
  let barn = 0; let voksen = 0; let support = 0; let last24 = 0; let multi = 0;
  const points = [];
  const first = rows.reduce((m, r) => (r.created_at < m ? r.created_at : m), rows[0]?.created_at || new Date().toISOString());

  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    const o = osloParts(r.created_at);
    byDay.set(o.day, (byDay.get(o.day) || 0) + 1);
    byHourOfDay[o.hour] += 1;
    if (now - t <= 48 * 3600000) {
      const hourKey = new Date(Math.floor(t / 3600000) * 3600000).toISOString();
      last48.set(hourKey, (last48.get(hourKey) || 0) + 1);
    }
    if (now - t <= 24 * 3600000) last24 += 1;
    if (r.reporter_type === 'barn') barn += 1; else voksen += 1;
    support += Number(r.support_count) || 0;
    if (r.kommune) {
      const fylke = FYLKER[String(r.kommune).slice(0, 2)] || 'Ukjent';
      fylker.set(fylke, (fylker.get(fylke) || 0) + 1);
      kommuner.set(r.kommune_navn || r.kommune, (kommuner.get(r.kommune_navn || r.kommune) || 0) + 1);
    }
    mainCategory.set(r.category || 'Annet', (mainCategory.get(r.category || 'Annet') || 0) + 1);
    const cats = new Set([r.category, ...splitReportText(r.description).categories].filter(Boolean));
    if (cats.size > 1) multi += 1;
    cats.forEach((c) => concerns.set(c, (concerns.get(c) || 0) + 1));
    points.push([Number(Number(r.lng).toFixed(3)), Number(Number(r.lat).toFixed(3))]);
  }

  // Running total. Per day over a long span; per hour when everything
  // happened within a few days (a straight line between two days says nothing).
  const days = Array.from(byDay.keys()).sort();
  let running = 0;
  let cumulative = days.map((day) => {
    running += byDay.get(day);
    return { t: `${day}T12:00:00`, label: new Date(`${day}T12:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }), count: byDay.get(day), total: running };
  });
  if (days.length < 5 && rows.length) {
    const byHour = new Map();
    for (const r of rows) {
      const h = Math.floor(new Date(r.created_at).getTime() / 3600000) * 3600000;
      byHour.set(h, (byHour.get(h) || 0) + 1);
    }
    const start = Math.min(...byHour.keys());
    running = 0;
    cumulative = [];
    for (let h = start; h <= now; h += 3600000) {
      running += byHour.get(h) || 0;
      cumulative.push({ t: new Date(h).toISOString(), label: new Date(h).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }), count: byHour.get(h) || 0, total: running });
    }
  }

  // Last 48 hours, every hour present (zeros included).
  const hours = [];
  const startHour = Math.floor((now - 47 * 3600000) / 3600000) * 3600000;
  for (let h = startHour; h <= now; h += 3600000) {
    const key = new Date(h).toISOString();
    hours.push({ t: key, count: last48.get(key) || 0 });
  }

  return {
    generatedAt: new Date().toISOString(),
    firstReportAt: first,
    totals: { reports: total, last24, support, kommuner: kommuner.size, fylker: fylker.size, barn, voksen, multiConcern: multi },
    cumulative,
    last48: hours,
    byHourOfDay,
    fylker: topN(fylker, 15),
    kommuner: topN(kommuner, 12),
    concerns: topN(concerns, 10),
    mainCategory: topN(mainCategory, 10),
    points,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', ['GET']); return res.status(405).end(); }
  const rl = checkRequestRateLimit(req, 'innsikt-data', 60, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forespørsler' });
  const access = await insightAccess(req);
  if (!access.ok) return res.status(401).json({ error: 'Logg inn' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Ikke tilgjengelig' });
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (!cache.data || Date.now() - cache.at > TTL_MS) {
      const rows = await getInsightReportRows();
      cache = { at: Date.now(), data: build(Array.isArray(rows) ? rows : []) };
    }
    return res.status(200).json({ ...cache.data, canManage: access.staff?.role === 'superuser' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente tall' });
  }
}
