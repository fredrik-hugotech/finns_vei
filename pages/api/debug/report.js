import { serverEnvStatus, isDebugAuthorized } from '../../../lib/envStatus';
import { getReportById, hasSupabaseConfig, sanitizeReportForDebug } from '../../../lib/supabaseRest';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!isDebugAuthorized(req)) {
    return res.status(403).json({ error: 'Debug endpoint is disabled or secret is invalid' });
  }

  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured', env: serverEnvStatus() });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const report = await getReportById(id);
    return res.status(200).json({
      report_exists: Boolean(report),
      id,
      current: report ? {
        nvdb_status: report.nvdb_status || null,
        nvdb_note: report.nvdb_note || null,
        nvdb_enriched_at: report.nvdb_enriched_at || null,
        has_trello_card_id: Boolean(report.trello_card_id),
        has_trello_list_id: Boolean(report.trello_list_id),
      } : null,
      report: sanitizeReportForDebug(report),
      env: serverEnvStatus(),
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/debug/report', event: 'failed', reportId: id, error: error?.message }));
    return res.status(500).json({ error: error.message || 'Debug lookup failed', env: serverEnvStatus() });
  }
}
