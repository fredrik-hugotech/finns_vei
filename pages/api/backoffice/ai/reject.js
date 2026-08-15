import { isAdminRequest } from '../../../../lib/backofficeAuth';
import { hasSupabaseConfig, rejectReportAiSuggestion, sanitizeReportForBackofficeAi } from '../../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../../lib/rateLimit';

const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'backoffice-ai-reject', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.', code: 'rate_limited' });
  }
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase is not configured', code: 'missing_supabase_config' });

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return res.status(400).json({ error: 'Missing report id', code: 'missing_id' });

  try {
    const report = await rejectReportAiSuggestion(id);
    return res.status(200).json({ ok: true, report: sanitizeReportForBackofficeAi(report), published: false });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Reject failed', code: error?.code || 'unknown' });
  }
}
