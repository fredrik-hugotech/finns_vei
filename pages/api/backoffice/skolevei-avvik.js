import { isAdminRequest } from '../../../lib/backofficeAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { getSchoolRouteDisruptions } from '../../../lib/transitDisruptions';

// Backoffice list of bus disruptions near schools — see lib/transitDisruptions.js.
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'backoffice-skolevei-avvik', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.', code: 'rate_limited' });
  }
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' });
  }
  try {
    return res.status(200).json(await getSchoolRouteDisruptions());
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'Fikk ikke kontakt med Entur. Prøv igjen om litt.' });
  }
}

export const config = { maxDuration: 20 };
