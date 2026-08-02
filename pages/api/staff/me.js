import { getStaffFromRequest } from '../../../lib/staffAuth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const staff = await getStaffFromRequest(req);
  if (!staff) return res.status(401).json({ error: 'Ikke innlogget' });
  return res.status(200).json({ email: staff.email, name: staff.name, role: staff.role });
}
