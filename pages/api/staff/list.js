import { isAdminRequest } from '../../../lib/backofficeAuth';
import { listStaff } from '../../../lib/supabaseRest';

// Active staff (name + email) for assignee pickers. Any logged-in admin.
export default async function handler(req, res) {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Forbidden' });
  try {
    const staff = (await listStaff()).filter((s) => s.active !== false).map((s) => ({ email: s.email, name: s.name || null }));
    return res.status(200).json({ staff });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente ansatte' });
  }
}
