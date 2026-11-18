import { isAdminRequest } from '../../../lib/backofficeAuth';
import { getStaffFromRequest } from '../../../lib/staffAuth';
import { checkRequestRateLimit } from '../../../lib/rateLimit';
import { hasSupabaseConfig, listStarredReportIds, listTeamStars, setReportStar } from '../../../lib/supabaseRest';

// Stars: the team's shared work list. GET: my ids and everyone's stars (who
// and when). POST {id, on}: star/unstar as me.
export default async function handler(req, res) {
  const rl = checkRequestRateLimit(req, 'backoffice-stjerner', 600, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  const staff = await getStaffFromRequest(req).catch(() => null);
  if (!staff?.id) return res.status(200).json({ ids: [], team: [], personal: false });
  try {
    if (req.method === 'GET') {
      const [ids, team] = await Promise.all([listStarredReportIds(staff.id), listTeamStars().catch(() => [])]);
      return res.status(200).json({ ids, team: team.map((t) => ({ id: t.report_id, at: t.created_at, by: t.staff?.name || t.staff?.email || '' })), me: staff.name || staff.email, personal: true });
    }
    if (req.method === 'POST') {
      const { id, on } = req.body || {};
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Ugyldig sak' });
      await setReportStar(staff.id, id, Boolean(on));
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lagre stjerne' });
  }
}
