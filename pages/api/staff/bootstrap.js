import { isBackofficeAuthorized } from '../../../lib/backofficeAuth';
import { countStaff, getStaffByEmail, createStaff } from '../../../lib/supabaseRest';
import { hashPassword } from '../../../lib/staffAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Gated by the shared BACKOFFICE_SECRET, same as staff/login.js's password
// check — rate limit it the same way since a guessed secret here lets an
// attacker mint a brand-new superuser while countStaff() === 0.
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// One-time creation of the first superuser, gated by the shared BACKOFFICE_SECRET.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end('Method Not Allowed'); }

  const rateLimit = checkRequestRateLimit(req, 'staff-bootstrap', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  if (!isBackofficeAuthorized(req)) return res.status(403).json({ error: 'Feil oppsett-passord.' });

  const { email, password, name } = req.body || {};
  if (!email || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Oppgi e-post og et passord på minst 8 tegn.' });
  }
  try {
    const existing = await countStaff();
    if (existing > 0) return res.status(400).json({ error: 'Det finnes allerede brukere. Be en superbruker legge deg til.' });
    if (await getStaffByEmail(email)) return res.status(400).json({ error: 'E-posten er allerede i bruk.' });
    await createStaff({ email, name, role: 'superuser', passwordHash: hashPassword(password) });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke opprette bruker.' });
  }
}
