import { createReportSupport, hasSupabaseConfig } from '../../lib/supabaseRest';
import { checkRequestRateLimit, clientIp, hashValue } from '../../lib/rateLimit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ~20 support "+1"s per 10 minutes per IP hash - generous enough for a busy
// classroom/household on shared wifi, tight enough to slow down a script.
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function logSupportApi(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/report-support', event, ...details }));
}

function cleanReportId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanSupportToken(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 160);
}

function cleanNote(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, 600);
  return text || null;
}

function cleanCategory(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, 80);
  return text || null;
}

function errorPayload(error, code, alreadySupported = false) {
  return {
    error,
    code,
    alreadySupported,
  };
}

function publicCode(error) {
  const code = error?.code || 'unknown';
  if ([
    'invalid_report_id',
    'missing_config',
    'missing_support_token',
    'supabase_insert_failed',
    'supabase_update_failed',
  ].includes(code)) {
    return code;
  }
  return 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'report-support', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    logSupportApi('rate_limited', { retryAfterMs: rateLimit.retryAfterMs });
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json(errorPayload('For mange forsøk. Prøv igjen om litt.', 'rate_limited'));
  }

  const reportId = cleanReportId(req.body?.reportId);
  const supportToken = cleanSupportToken(req.body?.supportToken);
  const note = cleanNote(req.body?.note);
  const category = cleanCategory(req.body?.category);
  const validReportUuid = UUID_RE.test(reportId);
  const configured = hasSupabaseConfig();

  logSupportApi('request_received', {
    hasSupabaseConfig: configured,
    reportIdPresent: Boolean(reportId),
    supportTokenPresent: Boolean(supportToken),
    validReportUuid,
  });

  if (!configured) {
    logSupportApi('final_response', { status: 503, code: 'missing_config' });
    return res.status(503).json(errorPayload('Supabase er ikke konfigurert', 'missing_config'));
  }

  if (!reportId || !validReportUuid) {
    logSupportApi('final_response', { status: 400, code: 'invalid_report_id' });
    return res.status(400).json(errorPayload('Mangler eller ugyldig reportId', 'invalid_report_id'));
  }

  if (!supportToken) {
    logSupportApi('final_response', { status: 400, code: 'missing_support_token' });
    return res.status(400).json(errorPayload('Mangler supportToken', 'missing_support_token'));
  }

  try {
    const result = await createReportSupport({
      reportId,
      supportToken,
      note,
      category,
      ipHash: hashValue(clientIp(req)),
      userAgentHash: hashValue(req.headers['user-agent'] || ''),
    });

    logSupportApi('final_response', { status: 200, code: 'ok', alreadySupported: result.alreadySupported, support_count: result.support_count });
    return res.status(200).json({
      id: reportId,
      support_count: result.support_count,
      alreadySupported: result.alreadySupported,
    });
  } catch (error) {
    const code = publicCode(error);
    const status = code === 'invalid_report_id' ? 404 : 500;
    logSupportApi('final_response', {
      status,
      code,
      upstreamStatus: error?.status || null,
      message: String(error?.message || '').slice(0, 240),
      alreadySupported: false,
    });
    return res.status(status).json(errorPayload(error.message || 'Kunne ikke støtte saken', code));
  }
}
