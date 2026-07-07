import { getStaffFromRequest, verifyPassword, hashPassword } from '../../../lib/staffAuth';
import { getStaffByEmail, setStaffPassword } from '../../../lib/supabaseRest';

// Change the logged-in staff member's own password.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end('Method Not Allowed'); }
  const staff = await getStaffFromRequest(req);
  if (!staff) return res.status(401).json({ error: 'Ikke innlogget' });

  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Nytt passord må være minst 8 tegn.' });
  }
  try {
    const full = await getStaffByEmail(staff.email);
    if (!full || !verifyPassword(currentPassword, full.password_hash)) {
      return res.status(400).json({ error: 'Feil nåværende passord.' });
    }
    await setStaffPassword(staff.id, hashPassword(newPassword));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke bytte passord.' });
  }
}
