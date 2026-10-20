import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { getScooterStats, hasSupabaseConfig } from '../../../lib/supabaseRest';
import venues from '../../../data/demo-venues.json';
import skoler from '../../../lib/skoler.json';

// Backoffice statistics for shared e-scooters in Kristiansand (Entur open
// data, collected every 3 minutes in the database). Aggregates only — no
// vehicle ids or single positions leave the database.
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RANGES = { '1d': 1, '7d': 7, '30d': 30 };
const TTL_MS = 2 * 60 * 1000;

const PLACES = [
  ...venues.map((v) => ({ name: v.name, type: v.type === 'hall' ? 'hall' : 'bane', lat: v.lat, lng: v.lng })),
  ...skoler.schools.map((s) => ({ name: s.name, type: 'skole', lat: s.lat, lng: s.lng })),
];

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
  const cached = cache.get(range);
  if (cached && Date.now() - cached.at < TTL_MS) return res.status(200).json(cached.data);

  try {
    const to = new Date();
    const from = new Date(to.getTime() - RANGES[range] * 86400000);
    const stats = await getScooterStats({ from: from.toISOString(), to: to.toISOString(), places: PLACES });
    const data = { range, ...stats };
    cache.set(range, { at: Date.now(), data });
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente statistikk' });
  }
}
