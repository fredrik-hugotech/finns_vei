import { generateBackofficeAiSuggestion, aiConfigStatus } from '../../../../lib/backofficeAi';
import { isBackofficeAuthorized } from '../../../../lib/backofficeAuth';
import { hasSupabaseConfig, sanitizeReportForBackofficeAi } from '../../../../lib/supabaseRest';

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
  if (!isBackofficeAuthorized(req)) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
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
