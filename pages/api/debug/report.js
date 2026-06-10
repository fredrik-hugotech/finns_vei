import { serverEnvStatus, isDebugAuthorized } from '../../../lib/envStatus';
import { getReportById, hasSupabaseConfig, sanitizeReportForDebug } from '../../../lib/supabaseRest';

function crossingValidationStatus(value) {
  const number = Number(value);
  if (value === null || value === undefined) return 'missing';
  if (!Number.isFinite(number)) return 'invalid_not_numeric';
  if (number < 0 || number > 1000) return 'invalid_out_of_range';
  return 'valid';
}

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
        trello_card_id: report.trello_card_id || null,
        trello_list_id: report.trello_list_id || null,
        latest_trello_error_or_note: String(report.nvdb_note || '').includes('Trello') ? report.nvdb_note : null,
        accident_count: report.accident_count ?? null,
        accident_search_radius_m: report.accident_search_radius_m ?? null,
        nearest_accident_distance_m: report.nearest_accident_distance_m ?? null,
        accident_summary: report.accident_summary || null,
        support_count: report.support_count ?? 0,
        nearest_crossing_distance_m: report.nearest_crossing_distance_m ?? null,
        nearest_crossing_distance_validation: crossingValidationStatus(report.nearest_crossing_distance_m),
      } : null,
      report: sanitizeReportForDebug(report),
      active_map_layer_configuration: {
        nvdbLayers: ['accidents'],
        accidentsMinZoom: 13,
        disabledNvdbLayers: ['speed_limit', 'gangfelt', 'aadt'],
        reportsClustered: true,
      },
      env: serverEnvStatus(),
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/debug/report', event: 'failed', reportId: id, error: error?.message }));
    return res.status(500).json({ error: error.message || 'Debug lookup failed', env: serverEnvStatus() });
  }
}
