import { finnGuard, notConfigured } from '../../../../lib/finnJobs';
import { aiConfigured } from '../../../../lib/aiAssist';
import { PROPOSAL_SETTING, proposalStatus } from '../../../../lib/factJob';
import { kickProposalChain } from '../../../../lib/proposalChain';
import { setInsightSetting } from '../../../../lib/supabaseRest';

// Finn's fact proposals for all existing cases. GET shows how many cases are
// left and the estimated cost. Nothing runs until staff confirm the cost
// (POST action=start with confirm=true); action=stop stops the run. The
// proposals are drafts on each case page: nothing is published.
export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'faktaforslag', limit: 60 });
  if (!who) return undefined;
  try {
    if (req.method === 'GET') return res.status(200).json({ configured: aiConfigured(), ...(await proposalStatus()) });
    if (req.method !== 'POST') { res.setHeader('Allow', ['GET', 'POST']); return res.status(405).end(); }
    const { action, confirm } = req.body || {};
    if (action === 'start') {
      if (!aiConfigured()) return notConfigured(res);
      if (confirm !== true) return res.status(400).json({ error: 'Kostnaden må bekreftes' });
      const status = await proposalStatus();
      const batch = `${new Date().toISOString().slice(0, 10)}-alle`;
      await setInsightSetting(PROPOSAL_SETTING, JSON.stringify({ by: who.by, at: new Date().toISOString(), batch, cases: status.remaining, cost_usd: status.cost_usd }));
      kickProposalChain(req.headers.host, 0);
      return res.status(200).json({ ok: true, batch, ...status });
    }
    if (action === 'stop') {
      await setInsightSetting(PROPOSAL_SETTING, '');
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Ukjent handling' });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/faktaforslag', message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: 'Noe gikk galt.' });
  }
}
