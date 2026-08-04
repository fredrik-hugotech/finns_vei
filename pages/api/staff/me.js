import { getStaffFromRequest } from '../../../lib/staffAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Just a session check (reads the cookie, returns {email,name,role}) - not a
// write, not a secret-guessing surface - so a generous budget, same as other
// lightweight authenticated reads (see staff/list.js).
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'staff-me', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }
  const staff = await getStaffFromRequest(req);
  if (!staff) return res.status(401).json({ error: 'Ikke innlogget' });
  return res.status(200).json({ email: staff.email, name: staff.name, role: staff.role });
}
