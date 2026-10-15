import { getNvdbLayerGeoJson } from '../../../lib/nvdb';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Accident hot spots for the /demo tour: every NVDB-registered accident in
// central Kristiansand, grouped on a ~180 m grid, keeping only the places
// with several accidents. Cached at the edge for a day, so the tour shows
// them instantly instead of a slow, everywhere-at-once accident layer.
const BBOX = '7.93,58.115,8.115,58.19';
const GRID_M = 180;
const MIN_COUNT = 4;
const MAX_SPOTS = 24;
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

function pointOf(feature) {
  const g = feature?.geometry;
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'MultiPoint') return g.coordinates[0];
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'demo-ulykker', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forespørsler' });
  }
  try {
    const geo = await getNvdbLayerGeoJson({ type: 'accidents', bbox: BBOX });
    const cells = new Map();
    const dLat = GRID_M / 111320;
    for (const f of geo?.features || []) {
      const p = pointOf(f);
      if (!p) continue;
      const [lng, lat] = p.map(Number);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const dLng = GRID_M / (111320 * Math.cos((lat * Math.PI) / 180));
      const key = `${Math.round(lat / dLat)},${Math.round(lng / dLng)}`;
      const c = cells.get(key) || { n: 0, sx: 0, sy: 0 };
      c.n += 1; c.sx += lng; c.sy += lat;
      cells.set(key, c);
    }
    const spots = [...cells.values()]
      .filter((c) => c.n >= MIN_COUNT)
      .sort((a, b) => b.n - a.n)
      .slice(0, MAX_SPOTS)
      .map((c) => ({ type: 'Feature', properties: { count: c.n }, geometry: { type: 'Point', coordinates: [Number((c.sx / c.n).toFixed(5)), Number((c.sy / c.n).toFixed(5))] } }));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ type: 'FeatureCollection', features: spots, total: (geo?.features || []).length });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ type: 'FeatureCollection', features: [], total: 0 });
  }
}
