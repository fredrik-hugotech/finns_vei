import { isDebugAuthorized, serverEnvStatus } from '../../../lib/envStatus';
import { countReportSupports, getReportById, hasSupabaseConfig, sanitizeReportForDebug, syncReportSupportCount } from '../../../lib/supabaseRest';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Secret-gated debug endpoint — rate limit it the same as debug/enrich.js so
// a leaked/guessed DEBUG_SECRET can't be used to hammer Supabase via
// repeated debug lookups.
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logDebugSupport(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/debug/support', event, ...details }));
}

async function step(name, fn) {
  try {
    const value = await fn();
    return { name, ok: true, value };
  } catch (error) {
    return {
      name,
      ok: false,
      error: {
        code: error?.code || null,
        status: error?.status || null,
        message: String(error?.message || '').slice(0, 240),
      },
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'debug-support', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  if (!isDebugAuthorized(req)) {
    return res.status(403).json({ error: 'Debug endpoint is disabled or secret is invalid' });
  }

  const reportId = typeof req.query.reportId === 'string' ? req.query.reportId.trim() : '';
  const validReportUuid = UUID_RE.test(reportId);
  const configured = hasSupabaseConfig();

  logDebugSupport('requested', {
    hasSupabaseConfig: configured,
    reportIdPresent: Boolean(reportId),
    validReportUuid,
  });

  if (!configured) {
    return res.status(503).json({
      error: 'Supabase is not configured',
      hasSupabaseConfig: false,
      env: serverEnvStatus(),
    });
  }

  if (!reportId || !validReportUuid) {
    return res.status(400).json({
      error: 'Missing or invalid reportId',
      code: 'invalid_report_id',
      hasSupabaseConfig: configured,
      reportIdPresent: Boolean(reportId),
      validReportUuid,
      env: serverEnvStatus(),
    });
  }

  const reportStep = await step('read_report', () => getReportById(reportId));
  const report = reportStep.ok ? reportStep.value : null;
  const countStep = await step('count_report_supports', () => countReportSupports(reportId));
  let updateStep = { name: 'noop_update_report_support_count', ok: false, skipped: true, reason: 'report_missing_or_count_failed' };

  if (report && countStep.ok) {
    updateStep = await step('noop_update_report_support_count', () => syncReportSupportCount(reportId, countStep.value));
  }

  const serviceRoleReadLikelyWorks = reportStep.ok && countStep.ok;
  const serviceRoleWriteLikelyWorks = updateStep.ok;

  logDebugSupport('completed', {
    reportExists: Boolean(report),
    supportRowsCount: countStep.ok ? countStep.value : null,
    serviceRoleReadLikelyWorks,
    serviceRoleWriteLikelyWorks,
  });

  return res.status(200).json({
    hasSupabaseConfig: configured,
    reportIdPresent: Boolean(reportId),
    validReportUuid,
    reportExists: Boolean(report),
    current_support_count: report?.support_count ?? null,
    supportRowsCount: countStep.ok ? countStep.value : null,
    serviceRoleReadLikelyWorks,
    serviceRoleWriteLikelyWorks,
    reportSupportsInsertTested: false,
    note: 'Insert is not tested by this debug endpoint to avoid creating support rows. POST /api/report-support tests insert safely with duplicate handling.',
    checks: {
      readReport: reportStep.ok ? { ok: true } : { ok: false, error: reportStep.error },
      countReportSupports: countStep.ok ? { ok: true } : { ok: false, error: countStep.error },
      noopUpdateReportSupportCount: updateStep.ok ? { ok: true } : { ok: false, skipped: updateStep.skipped || false, reason: updateStep.reason || null, error: updateStep.error || null },
    },
    report: sanitizeReportForDebug(report),
    suggestedSqlIfGrantsFail: [
      'GRANT USAGE ON SCHEMA public TO service_role;',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_supports TO service_role;',
      'GRANT SELECT, UPDATE ON public.reports TO service_role;',
      'ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS support_count integer NOT NULL DEFAULT 0;',
      'CREATE TABLE IF NOT EXISTS public.report_supports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), support_token text, ip_hash text, user_agent_hash text);',
      'CREATE INDEX IF NOT EXISTS report_supports_report_id_idx ON public.report_supports(report_id);',
      'CREATE UNIQUE INDEX IF NOT EXISTS report_supports_report_token_unique_idx ON public.report_supports(report_id, support_token) WHERE support_token IS NOT NULL;',
    ],
    env: serverEnvStatus(),
  });
}
