import crypto from 'crypto';
import { createReportSupport, hasSupabaseConfig } from '../../lib/supabaseRest';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase er ikke konfigurert' });
  }

  const reportId = cleanReportId(req.body?.reportId);
  const supportToken = cleanSupportToken(req.body?.supportToken);
  if (!reportId) return res.status(400).json({ error: 'Mangler reportId' });
  if (!supportToken) return res.status(400).json({ error: 'Mangler supportToken' });

  try {
    const result = await createReportSupport({
      reportId,
      supportToken,
      ipHash: hashValue(clientIp(req)),
      userAgentHash: hashValue(req.headers['user-agent'] || ''),
    });

    return res.status(200).json({
      id: reportId,
      support_count: result.support_count,
      alreadySupported: result.alreadySupported,
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/report-support', event: 'failed', reportId, error: error?.message, status: error?.status || null }));
    return res.status(400).json({ error: error.message || 'Kunne ikke støtte saken' });
  }
}
