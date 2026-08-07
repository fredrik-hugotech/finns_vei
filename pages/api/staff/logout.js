import { deleteStaffSession } from '../../../lib/supabaseRest';
import { sessionTokenFromRequest, clearSessionCookie } from '../../../lib/staffAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Was the one staff/backoffice route with no rate limit at all - an
// unauthenticated request with a garbage cookie still reached
// deleteStaffSession (an outbound Supabase DELETE) on every call.
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end('Method Not Allowed'); }
  const rateLimit = checkRequestRateLimit(req, 'staff-logout', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }
  const token = sessionTokenFromRequest(req);
  if (token) { try { await deleteStaffSession(token); } catch (_e) { /* ignore */ } }
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
