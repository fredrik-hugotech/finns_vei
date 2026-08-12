import { isBackofficeAuthorized } from '../../../lib/backofficeAuth';
import { getStaffFromRequest, hashPassword } from '../../../lib/staffAuth';
import { listStaff, createStaff, setStaffActive, getStaffByEmail } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Gated by the shared BACKOFFICE_SECRET as a bootstrap fallback (same as
// staff/bootstrap.js) alongside session-based auth — rate limit the secret
// guess the same way.
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Superuser-only user management. The shared secret also authorizes (for setup).
async function requireSuperuser(req) {
  const staff = await getStaffFromRequest(req);
  if (staff && staff.role === 'superuser') return staff;
  if (isBackofficeAuthorized(req)) return { role: 'superuser', bootstrap: true };
  return null;
}

export default async function handler(req, res) {
  const rateLimit = checkRequestRateLimit(req, 'staff-users', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const admin = await requireSuperuser(req);
  if (!admin) return res.status(403).json({ error: 'Kun superbrukere.' });

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ users: await listStaff() });
    }
    if (req.method === 'POST') {
      const { email, password, name, role } = req.body || {};
      if (!email || !password || String(password).length < 8) {
        return res.status(400).json({ error: 'Oppgi e-post og passord på minst 8 tegn.' });
      }
      if (await getStaffByEmail(email)) return res.status(400).json({ error: 'E-posten er allerede i bruk.' });
      const created = await createStaff({ email, name, role: role === 'superuser' ? 'superuser' : 'staff', passwordHash: hashPassword(password) });
      return res.status(201).json({ user: { id: created?.id, email: created?.email, name: created?.name, role: created?.role, active: true } });
    }
    if (req.method === 'PATCH') {
      const { id, active } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Mangler bruker-id' });

      if (active !== true) {
        // getStaffFromRequest() already rejects any session with
        // active === false on its very next request, and staff/bootstrap only
        // works when there are zero staff rows — so deactivating yourself or
        // the last active superuser can permanently lock everyone out with no
        // recovery path (if BACKOFFICE_SECRET isn't set). setStaffActive()
        // below persists Boolean(active), so this guard must catch every
        // non-true value (missing/null/0/''), not just a strict `false`,
        // or a caller that omits `active` bypasses the lockout protection
        // while still ending up deactivated.
        const allStaff = await listStaff();
        const target = allStaff.find((s) => s.id === id);
        if (!target) return res.status(404).json({ error: 'Fant ikke brukeren.' });

        if (admin.id && admin.id === id) {
          return res.status(400).json({ error: 'Du kan ikke deaktivere din egen konto.' });
        }

        if (target.role === 'superuser' && target.active !== false) {
          const activeSuperusers = allStaff.filter((s) => s.role === 'superuser' && s.active !== false);
          if (activeSuperusers.length <= 1) {
            return res.status(400).json({ error: 'Kan ikke deaktivere den siste aktive superbrukeren.' });
          }
        }
      }

      await setStaffActive(id, active);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Feil ved brukerhåndtering.' });
  }
}
