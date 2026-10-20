import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { getScooterPlaceDaily, getScooterPlaceStats, hasSupabaseConfig } from '../../../lib/supabaseRest';

// Backoffice: shared e-scooter traffic at schools and sports venues across
// Norway (Entur open data, counted per place and hour in the database).
// ?range=1d|7d|30d|90d  ?fylke=<nn>  ?kommune=<kommunenummer>  ?type=anlegg|skole
const RATE_LIMIT = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RANGES = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
const TTL_MS = 2 * 60 * 1000;
const cache = new Map();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'backoffice-sparkesykler', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
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

  const range = RANGES[req.query.range] ? req.query.range : '7d';
  const kommune = /^\d{4}$/.test(String(req.query.kommune || '')) ? String(req.query.kommune) : null;
  const fylke = /^\d{2}$/.test(String(req.query.fylke || '')) ? String(req.query.fylke) : null;
  const kind = req.query.type === 'anlegg' || req.query.type === 'skole' ? req.query.type : null;
  const key = `${range}|${fylke || ''}|${kommune || ''}|${kind || ''}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return res.status(200).json(cached.data);

  try {
    const to = new Date();
    const from = new Date(to.getTime() - RANGES[range] * 86400000);
    const scope = { from: from.toISOString(), to: to.toISOString(), fylke, kommune };
    const [stats, byDay] = await Promise.all([getScooterPlaceStats({ ...scope, kind }), getScooterPlaceDaily(scope)]);
    const data = { range, fylke, kommune, type: kind, ...stats, byDay: byDay || [] };
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente statistikk' });
  }
}
