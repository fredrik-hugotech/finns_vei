import { isAdminRequest } from '../../../lib/backofficeAuth';
import { getStaffFromRequest } from '../../../lib/staffAuth';
import { getTrelloBoardId } from '../../../lib/trello';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Tiny endpoint to verify the admin password (login) and hand back the Trello
// board URL. No accounts — the shared BACKOFFICE_SECRET is the key, so this
// is the actual front door to the whole backoffice for anyone who knows (or
// is guessing) it. Every other secret-gated endpoint in the codebase already
// rate-limits itself (staff/login.js, debug/enrich.js, ...); this one didn't.
const RATE_LIMIT = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  // A logged-in staff member (session cookie) is answered straight away: the
  // map checks this on every load, and counting those checks against the
  // password-guessing limit below locked staff out of the admin map layers
  // after a few reloads.
  const staff = await getStaffFromRequest(req);
  if (staff) return res.status(200).json({ ok: true, trelloBoardUrl: `https://trello.com/b/${getTrelloBoardId()}` });

  const rateLimit = checkRequestRateLimit(req, 'backoffice-session', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ ok: false, error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ ok: false });
  }
  return res.status(200).json({ ok: true, trelloBoardUrl: `https://trello.com/b/${getTrelloBoardId()}` });
}
