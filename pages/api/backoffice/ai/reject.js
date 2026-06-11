import { isBackofficeAuthorized } from '../../../../lib/backofficeAuth';
import { hasSupabaseConfig, rejectReportAiSuggestion, sanitizeReportForBackofficeAi } from '../../../../lib/supabaseRest';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }
  if (!isBackofficeAuthorized(req)) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
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
