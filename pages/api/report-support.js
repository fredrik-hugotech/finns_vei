import { hasSupabaseConfig, incrementReportSupport } from '../../lib/supabaseRest';

function cleanReportId(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  if (!reportId) return res.status(400).json({ error: 'Mangler reportId' });

  try {
    const updated = await incrementReportSupport(reportId);
    return res.status(200).json({
      id: reportId,
      support_count: Number(updated?.support_count || 0),
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/report-support', event: 'failed', reportId, error: error?.message }));
    return res.status(400).json({ error: error.message || 'Kunne ikke støtte saken' });
  }
}
