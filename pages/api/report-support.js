import crypto from 'crypto';
import { createReportSupport, hasSupabaseConfig } from '../../lib/supabaseRest';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function hashValue(value) {
  if (!value) return null;
  const salt = process.env.SUPPORT_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'finns-vei-support';
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
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

  const reportId = cleanReportId(req.body?.reportId);
  const supportToken = cleanSupportToken(req.body?.supportToken);
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
