import { isBackofficeAuthorized } from '../../../lib/backofficeAuth';
import { getStaffFromRequest, hashPassword } from '../../../lib/staffAuth';
import { listStaff, createStaff, setStaffActive, getStaffByEmail } from '../../../lib/supabaseRest';

// Superuser-only user management. The shared secret also authorizes (for setup).
async function requireSuperuser(req) {
  const staff = await getStaffFromRequest(req);
  if (staff && staff.role === 'superuser') return staff;
  if (isBackofficeAuthorized(req)) return { role: 'superuser', bootstrap: true };
  return null;
}

export default async function handler(req, res) {
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
