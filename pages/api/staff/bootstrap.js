import { isBackofficeAuthorized } from '../../../lib/backofficeAuth';
import { countStaff, getStaffByEmail, createStaff } from '../../../lib/supabaseRest';
import { hashPassword } from '../../../lib/staffAuth';

// One-time creation of the first superuser, gated by the shared BACKOFFICE_SECRET.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end('Method Not Allowed'); }
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
