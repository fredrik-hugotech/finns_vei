import { isAdminRequest } from '../../../lib/backofficeAuth';
import { listHotCases, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Read-only triage view: open cases ranked by a heat score (support_count +
// concern/facet diversity), so staff aren't limited to Trello column order
// when deciding what to look at next. No mutations happen here — case
// actions still live on /api/backoffice/cases + /backoffice/sak/[id].
export default async function handler(req, res) {
  const rateLimit = checkRequestRateLimit(req, 'backoffice-hot-cases', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.', code: 'rate_limited' });
  }

  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const cases = await listHotCases({ limit: 300 });
    return res.status(200).json({ cases });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Kunne ikke hente hotteste saker' });
  }
}
