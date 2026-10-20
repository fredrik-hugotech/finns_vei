import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { getScooterPlaceStats, hasSupabaseConfig } from '../../../lib/supabaseRest';

// Backoffice: shared e-scooter traffic at schools and sports venues across
// Norway (Entur open data, counted per place and hour in the database).
// ?range=1d|7d|30d|90d  ?kommune=<kommunenummer>  ?type=anlegg|skole
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
  const kind = req.query.type === 'anlegg' || req.query.type === 'skole' ? req.query.type : null;
  const key = `${range}|${kommune || ''}|${kind || ''}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return res.status(200).json(cached.data);

  try {
    const to = new Date();
    const from = new Date(to.getTime() - RANGES[range] * 86400000);
    const stats = await getScooterPlaceStats({ from: from.toISOString(), to: to.toISOString(), kommune, kind });
    const data = { range, kommune, type: kind, ...stats };
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente statistikk' });
  }
}
