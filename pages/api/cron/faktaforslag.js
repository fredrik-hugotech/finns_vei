import { isAdminRequest } from '../../../lib/backofficeAuth';
import { aiConfigured } from '../../../lib/aiAssist';
import { PROPOSAL_SETTING, draftProposals } from '../../../lib/factJob';
import { kickProposalChain } from '../../../lib/proposalChain';
import { getInsightSetting, hasSupabaseConfig, setInsightSetting } from '../../../lib/supabaseRest';
import { timingSafeEqualStrings } from '../../../lib/timingSafeEqualStrings';

// Runs Finn's fact proposals for existing cases, a few minutes at a time,
// handing over to a fresh run (?kjede=1) until all are done. Does nothing
// unless staff have confirmed the cost (setting «faktaforslag_bekreftet»).
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(secret) && timingSafeEqualStrings(req.headers.authorization || '', `Bearer ${secret}`);
  if (!cronOk && !(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang' });
  if (!hasSupabaseConfig() || !aiConfigured()) return res.status(503).json({ error: 'Ikke konfigurert' });
  const raw = await getInsightSetting(PROPOSAL_SETTING).catch(() => null);
  let run = null;
  try { run = raw ? JSON.parse(raw) : null; } catch (_e) { run = null; }
  if (!run?.batch) return res.status(200).json({ ok: false, reason: 'Ikke bekreftet' });
  if (run.finished_at) return res.status(200).json({ ok: false, reason: 'Ferdig' });
  const out = await draftProposals({ batch: run.batch, deadline: Date.now() + 230000 });
  const round = Number(req.query.runde) || 0;
  const chained = req.query.kjede === '1' && out.drafted > 0 && round < 60 && kickProposalChain(req.headers.host, round + 1);
  if (!chained) {
    await setInsightSetting(PROPOSAL_SETTING, JSON.stringify({ ...run, finished_at: new Date().toISOString() })).catch(() => {});
  }
  return res.status(200).json({ ok: true, ...out, chained: Boolean(chained) });
}
