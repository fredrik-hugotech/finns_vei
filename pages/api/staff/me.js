import { getStaffFromRequest } from '../../../lib/staffAuth';

export default async function handler(req, res) {
  const staff = await getStaffFromRequest(req);
  if (!staff) return res.status(401).json({ error: 'Ikke innlogget' });
  return res.status(200).json({ email: staff.email, name: staff.name, role: staff.role });
}
