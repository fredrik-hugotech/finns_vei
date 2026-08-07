import { isAdminRequest } from '../../../lib/backofficeAuth';
import { getCompetitionStats, listCompetitions, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const TTL_MS = 5 * 60 * 1000;

// Internal: the density heatmap geojson + leaderboard for a competition.
// Gated by BACKOFFICE_SECRET so the "where children cycle" data stays internal.
//
// getCompetitionStats(..., { includeGeojson: true }) does an O(trips x
// path-length) segment-snapping pass to build the heatmap - the one place
// left in the app doing real per-request geometry work with no caching, on
// a manually-reloaded staff view (/backoffice/tetthet). Same short
// per-instance TTL memo already proven on /api/backoffice/hotspots and
// /api/backoffice/hot-cases, keyed per competition+mode.
const cache = new Map();
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'backoffice-competition-trips', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.', code: 'rate_limited' });
  }
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' });
  }
  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) {
      // No id → return the list so the internal page can offer a picker.
      const competitions = await listCompetitions({ activeOnly: false });
      return res.status(200).json({ competitions });
    }
    const mode = typeof req.query.mode === 'string' ? req.query.mode : null;
    const cacheKey = `${id}|${mode || ''}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < TTL_MS) {
      return res.status(200).json(cached.data);
    }
    // This backs the internal density heatmap (backoffice/tetthet), which needs
    // the segment geojson - explicit now that getCompetitionStats defaults to false.
    const stats = await getCompetitionStats(id, { mode, includeGeojson: true });
    if (!stats) return res.status(404).json({ error: 'Fant ikke konkurransen' });
    cache.set(cacheKey, { at: Date.now(), data: stats });
    return res.status(200).json(stats);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Kunne ikke hente data' });
  }
}
