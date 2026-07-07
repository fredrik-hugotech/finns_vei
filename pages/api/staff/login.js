import { getStaffByEmail, createStaffSession } from '../../../lib/supabaseRest';
import { verifyPassword, newSessionToken, sessionExpiry, setSessionCookie } from '../../../lib/staffAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end('Method Not Allowed'); }
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Fyll inn e-post og passord.' });
  try {
    const staff = await getStaffByEmail(email);
    if (!staff || staff.active === false || !verifyPassword(password, staff.password_hash)) {
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
