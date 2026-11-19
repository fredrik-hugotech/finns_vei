import { waitUntil } from '@vercel/functions';

// Hands the bulk fact-proposal run over to a fresh function run.
export function kickProposalChain(host, round = 0) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !host) return false;
  waitUntil((async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      await fetch(`https://${host}/api/cron/faktaforslag?kjede=1&runde=${round}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: ctl.signal });
    } catch (_e) { /* handed over */ } finally { clearTimeout(t); }
  })());
  return true;
}
