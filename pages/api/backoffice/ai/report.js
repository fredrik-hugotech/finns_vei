import { backofficeEnvStatus, isBackofficeAuthorized } from '../../../../lib/backofficeAuth';
import { getReportById, hasSupabaseConfig, sanitizeReportForBackofficeAi } from '../../../../lib/supabaseRest';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  if (!isBackofficeAuthorized(req)) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase is not configured', code: 'missing_supabase_config', env: backofficeEnvStatus() });

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return res.status(400).json({ error: 'Missing report id', code: 'missing_id' });

  try {
    const report = await getReportById(id);
    return res.status(200).json({ ok: true, report_exists: Boolean(report), report: sanitizeReportForBackofficeAi(report), env: backofficeEnvStatus() });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Backoffice report lookup failed', code: 'unknown' });
  }
}
