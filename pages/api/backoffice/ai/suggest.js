import { generateBackofficeAiSuggestion, aiConfigStatus } from '../../../../lib/backofficeAi';
import { isAdminRequest } from '../../../../lib/backofficeAuth';
import { hasSupabaseConfig, sanitizeReportForBackofficeAi } from '../../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../../lib/rateLimit';

// Each call here can trigger a real, billed OpenAI request (see
// lib/backofficeAi.js) and BACKOFFICE_AI_DAILY_LIMIT is opt-in/unset by
// default, so nothing previously stopped a valid admin session (or a
// guessed BACKOFFICE_SECRET) from looping this over every report and
// running up spend. Rate limit it like the other write-triggering
// backoffice endpoints.
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function errorResponse(error) {
  return {
    error: error?.message || 'AI suggestion failed',
    code: error?.code || 'unknown',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'backoffice-ai-suggest', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.', code: 'rate_limited' });
  }

  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase is not configured', code: 'missing_supabase_config' });

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return res.status(400).json({ error: 'Missing report id', code: 'missing_id' });

  try {
    const { report, suggestion } = await generateBackofficeAiSuggestion(id);
    return res.status(200).json({
      ok: true,
      ai_config: aiConfigStatus(),
      report: sanitizeReportForBackofficeAi(report),
      suggestion,
      published: false,
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/backoffice/ai/suggest', event: 'failed', reportId: id, code: error?.code || null, message: String(error?.message || '').slice(0, 240) }));
    return res.status(error?.status || 500).json(errorResponse(error));
  }
}
