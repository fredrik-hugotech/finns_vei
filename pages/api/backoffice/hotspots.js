import { isAdminRequest } from '../../../lib/backofficeAuth';
import { listRecurringHotspots, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const TTL_MS = 5 * 60 * 1000;

// Read-only recurrence/seasonal-pattern view: groups the FULL report history
// (any status, any age) into spatial clusters (lib/hotspotAnalysis.js) and
// keeps only spots that recur across multiple distinct seasons/years — i.e.
// chronic problem spots, as opposed to a spot that simply got many reports
// during one short burst. Distinct from /api/backoffice/hot-cases, which
// ranks currently OPEN cases by a heat score right now. No mutations happen
// here — this is pure analysis over existing data.
//
// Unlike its siblings (/api/reports, /api/aktuelt, /api/competitions/[id]),
// this endpoint used to re-fetch and re-cluster the entire report history
// from scratch on every single view, with no caching at all — even though
// it's explicitly designed to keep reading unbounded history as the app
// grows. This is a manually-reloaded, read-only staff view (no polling), so
// a short per-instance TTL memo (same pattern as lib/aktuelt.js) only bounds
// how stale a reload can be — it doesn't change what staff can do.
let cache = { at: 0, data: null };

export default async function handler(req, res) {
  const rateLimit = checkRequestRateLimit(req, 'backoffice-hotspots', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
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
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    if (cache.data && Date.now() - cache.at < TTL_MS) {
      return res.status(200).json({ ...cache.data, cachedAt: cache.at });
    }
    const hotspots = await listRecurringHotspots({ limit: 5000 });
    const data = { hotspots };
    cache = { at: Date.now(), data };
    return res.status(200).json({ ...data, cachedAt: cache.at });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Kunne ikke beregne gjentakende steder' });
  }
}
