import { isAdminRequest } from '../../../lib/backofficeAuth';
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
