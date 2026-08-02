import { isAdminRequest } from '../../../lib/backofficeAuth';
import { listStaff } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Active staff (name + email) for assignee pickers. Any logged-in admin.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'staff-list', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.', code: 'rate_limited' });
  }
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Forbidden' });
  try {
    const staff = (await listStaff()).filter((s) => s.active !== false).map((s) => ({ email: s.email, name: s.name || null }));
    return res.status(200).json({ staff });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente ansatte' });
  }
}
