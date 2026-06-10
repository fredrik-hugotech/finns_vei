import { isDebugAuthorized, serverEnvStatus } from '../../../lib/envStatus';
import { runReportWorkflowBestEffort } from '../../../lib/reportWorkflow';
import { getReportById, hasSupabaseConfig, sanitizeReportForDebug } from '../../../lib/supabaseRest';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
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
    if (!report) return res.status(404).json({ error: 'Report not found', id, env: serverEnvStatus() });

    const result = await runReportWorkflowBestEffort(report, { createMissingTrello: true });
    return res.status(200).json({
      id,
      nvdb_status: result.nvdbStatus || result.report?.nvdb_status || null,
      trello_warning: result.trelloWarning,
      report: sanitizeReportForDebug(result.report),
      env: serverEnvStatus(),
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/debug/enrich', event: 'failed', reportId: id, error: error?.message }));
    return res.status(500).json({ error: error.message || 'Debug enrichment failed', env: serverEnvStatus() });
  }
}
