import { deleteStaffSession } from '../../../lib/supabaseRest';
import { sessionTokenFromRequest, clearSessionCookie } from '../../../lib/staffAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).end('Method Not Allowed'); }
  const token = sessionTokenFromRequest(req);
  if (token) { try { await deleteStaffSession(token); } catch (_e) { /* ignore */ } }
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
