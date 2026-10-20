import { checkRequestRateLimit } from '../../lib/rateLimit';
import { getSchoolRouteDisruptions } from '../../lib/transitDisruptions';

// Public map layer "Bussavvik": closed stops and detours for the bus, with
// the nearest school. Only information Agder Kollektivtrafikk already
// publishes (via Entur) — nothing from Finns Fairway's own data.
const RATE_LIMIT = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'avvik', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }
  try {
    const data = await getSchoolRouteDisruptions();
    const items = data.items.map((i) => ({
      id: i.id,
      summary: i.summary,
      advice: i.advice,
      start: i.start,
      end: i.end,
      upcoming: i.upcoming,
      nightOnly: i.nightOnly,
      nearSchool: i.nearSchool,
      stops: i.stops.map((st) => ({ name: st.name, lat: st.lat, lng: st.lng, lines: st.lines, school: st.school.name, schoolDistanceM: st.school.distanceM })),
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ items, nearSchoolM: data.nearSchoolM, updatedAt: data.cachedAt });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'Fikk ikke kontakt med Entur.' });
  }
}

export const config = { maxDuration: 20 };
