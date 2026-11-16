import { isAdminRequest } from '../../../lib/backofficeAuth';
import { getTriageOverviewRows, hasSupabaseConfig, listReportsNeedingTriage } from '../../../lib/supabaseRest';
import { triageConfigured, triageInputHash } from '../../../lib/aiTriage';
import { priorityScore } from '../../../lib/aiStats';
import { FYLKER } from '../../../lib/fylker';
import { REPORT_STATUS } from '../../../lib/config';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Priority list for staff, sorted by priorityScore (lib/aiStats.js).
// Finished cases are left out.
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', ['GET']); return res.status(405).end(); }
  const rl = checkRequestRateLimit(req, 'backoffice-prioritering', 60, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  try {
    const [rows0, backlog] = await Promise.all([getTriageOverviewRows(), listReportsNeedingTriage().catch(() => null)]);
    const rows = rows0 || [];
    // Reports Finn hasn't assessed, or assessed under older rules.
    const waiting = backlog ? backlog.reports.filter((r) => backlog.hashByReport.get(r.id) !== triageInputHash(r)) : [];
    const reassess = backlog ? waiting.filter((r) => backlog.hashByReport.has(r.id)).length : 0;
    const open = rows.filter((r) => r.status !== REPORT_STATUS.DONE);
    const cases = open.filter((r) => r.urgency).map((r) => ({
      ...r,
      fylke: r.kommune ? FYLKER[String(r.kommune).slice(0, 2)] || '' : '',
      score: priorityScore(r),
    })).sort((a, b) => b.score - a.score);
    return res.status(200).json({
      configured: triageConfigured(),
      total: rows.length,
      open: open.length,
      assessed: cases.length,
      pending: backlog ? waiting.length : open.length - cases.length,
      reassess,
      cases,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente prioriteringer' });
  }
}
