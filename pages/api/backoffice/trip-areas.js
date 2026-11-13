import { isAdminRequest } from '../../../lib/backofficeAuth';
import { hasSupabaseConfig, listTripMidpoints } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Internal: where in Norway trips are being logged, grouped by municipality,
// for the dashboard's "Sykkelspor" card. Each row links to the Sykkelspor map
// zoomed to that area. Trips are clustered on a ~10 km grid first and each
// cluster is named after the municipality at its centre (Kartverket's open
// kommuneinfo), so this makes at most a handful of lookups per refresh.
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };
const kommuneByCell = new Map();

async function kommuneAt(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (kommuneByCell.has(key)) return kommuneByCell.get(key);
  try {
    const r = await fetch(`https://ws.geonorge.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lng}&koordsys=4258`, { headers: { 'User-Agent': 'Finnsvei (finnsvei.no)' } });
    const d = r.ok ? await r.json() : null;
    const value = d?.kommunenavn ? { kommune: d.kommunenavn, fylke: d.fylkesnavn || '' } : null;
    kommuneByCell.set(key, value);
    return value;
  } catch (_e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'backoffice-trip-areas', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.', code: 'rate_limited' });
  }
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase is not configured' });

  if (cache.data && Date.now() - cache.at < TTL_MS) return res.status(200).json(cache.data);

  try {
    const points = await listTripMidpoints();
    const weekAgo = Date.now() - 7 * 86400000;
    // ~10 km cells.
    const cells = new Map();
    for (const p of points) {
      const key = `${Math.floor(p.lat / 0.09)},${Math.floor(p.lng / 0.18)}`;
      const c = cells.get(key) || { n: 0, week: 0, sx: 0, sy: 0, w: 180, s: 90, e: -180, no: -90 };
      c.n += 1;
      if (new Date(p.createdAt).getTime() >= weekAgo) c.week += 1;
      c.sx += p.lng; c.sy += p.lat;
      c.w = Math.min(c.w, p.lng); c.e = Math.max(c.e, p.lng); c.s = Math.min(c.s, p.lat); c.no = Math.max(c.no, p.lat);
      cells.set(key, c);
    }
    // Name the busiest cells and merge cells in the same municipality.
    const top = Array.from(cells.values()).sort((a, b) => b.n - a.n).slice(0, 25);
    const named = await Promise.all(top.map(async (c) => ({ ...c, place: await kommuneAt(c.sy / c.n, c.sx / c.n) })));
    const areas = new Map();
    for (const c of named) {
      const name = c.place?.kommune || 'Ukjent kommune';
      const a = areas.get(name) || { kommune: name, fylke: c.place?.fylke || '', trips: 0, lastWeek: 0, w: 180, s: 90, e: -180, n: -90 };
      a.trips += c.n; a.lastWeek += c.week;
      a.w = Math.min(a.w, c.w); a.e = Math.max(a.e, c.e); a.s = Math.min(a.s, c.s); a.n = Math.max(a.n, c.no);
      areas.set(name, a);
    }
    const list = Array.from(areas.values())
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 10)
      .map((a) => ({ kommune: a.kommune, fylke: a.fylke, trips: a.trips, lastWeek: a.lastWeek, bounds: [[a.w, a.s], [a.e, a.n]] }));
    const data = {
      totalTrips: points.length,
      lastWeek: points.filter((p) => new Date(p.createdAt).getTime() >= weekAgo).length,
      areas: list,
    };
    cache = { at: Date.now(), data };
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente turer' });
  }
}
