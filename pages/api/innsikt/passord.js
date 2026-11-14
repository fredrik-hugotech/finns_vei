import { getStaffFromRequest, hashPassword } from '../../../lib/staffAuth';
import { INSIGHT_PASSWORD_KEY } from '../../../lib/insightAuth';
import { deleteAllInsightSessions, getInsightSetting, setInsightSetting, hasSupabaseConfig } from '../../../lib/supabaseRest';

// Superusers set (or change) the shared dashboard password. Changing it signs
// out everyone who used the old one.
export default async function handler(req, res) {
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Ikke tilgjengelig' });
  const staff = await getStaffFromRequest(req);
  if (!staff || staff.role !== 'superuser') return res.status(403).json({ error: 'Kun superbrukere.' });
  if (req.method === 'GET') {
    return res.status(200).json({ hasPassword: Boolean(await getInsightSetting(INSIGHT_PASSWORD_KEY).catch(() => null)) });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', ['GET', 'POST']); return res.status(405).end(); }
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Passordet må ha minst 8 tegn.' });
  await setInsightSetting(INSIGHT_PASSWORD_KEY, hashPassword(password));
  await deleteAllInsightSessions().catch(() => {});
  return res.status(200).json({ ok: true });
}
