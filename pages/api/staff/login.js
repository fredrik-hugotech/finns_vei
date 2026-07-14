import { getStaffByEmail, createStaffSession } from '../../../lib/supabaseRest';
import { verifyPassword, DUMMY_PASSWORD_HASH, newSessionToken, sessionExpiry, setSessionCookie } from '../../../lib/staffAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Tight budget for a credential endpoint - 8 attempts per 10 minutes per IP
// hash is generous for a staff member mistyping a password a few times, but
// blunt for a script guessing passwords.
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end('Method Not Allowed'); }

  const rateLimit = checkRequestRateLimit(req, 'staff-login', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Fyll inn e-post og passord.' });
  try {
    const staff = await getStaffByEmail(email);
    if (!staff || staff.active === false) {
      // No such (active) account: still run an equivalent-cost password
      // verification against a constant dummy hash, so this path takes about
      // as long as the "wrong password" path below and doesn't leak account
      // existence via response timing.
      verifyPassword(password, DUMMY_PASSWORD_HASH);
      return res.status(401).json({ error: 'Feil e-post eller passord.' });
    }
    if (!verifyPassword(password, staff.password_hash)) {
      return res.status(401).json({ error: 'Feil e-post eller passord.' });
    }
    const token = newSessionToken();
    await createStaffSession(token, staff.id, sessionExpiry());
    setSessionCookie(res, token);
    return res.status(200).json({ email: staff.email, name: staff.name || null, role: staff.role || 'staff' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Innlogging feilet.' });
  }
}
