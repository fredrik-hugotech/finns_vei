import { isAdminRequest } from '../../../lib/backofficeAuth';
import { getTriageOverviewRows, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { triageConfigured } from '../../../lib/aiTriage';
import { FYLKER } from '../../../lib/fylker';
import { REPORT_STATUS } from '../../../lib/config';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Priority list for staff. Score = AI urgency, raised by citizen support and
// by other reports at the same spot, lowered when the work is large (so quick,
// safe wins rise) — see priorityScore. Finished cases are left out.
const EFFORT_FACTOR = { enkel: 1.25, middels: 1, stor: 0.85 };

function priorityScore(r) {
  const urgency = Number(r.urgency) || 2;
  const support = Math.log2(1 + (Number(r.support_count) || 0));
  const cluster = Math.log2(1 + (Number(r.nearby) || 0));
  return Number(((urgency * 2 + support + cluster * 1.5) * (EFFORT_FACTOR[r.effort] || 1)).toFixed(2));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', ['GET']); return res.status(405).end(); }
  const rl = checkRequestRateLimit(req, 'backoffice-prioritering', 60, 10 * 60 * 1000);
  if (!rl.allowed) return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase mangler' });
  try {
    const rows = (await getTriageOverviewRows()) || [];
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
      pending: open.length - cases.length,
      cases,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente prioriteringer' });
  }
}
