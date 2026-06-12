import { getReportThread, hasSupabaseConfig } from '../../lib/supabaseRest';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id) return res.status(400).json({ error: 'Mangler id' });
  if (!hasSupabaseConfig()) return res.status(200).json(null);

  try {
    const thread = await getReportThread(id);
    return res.status(200).json(thread);
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/report-thread', event: 'failed', message: String(error?.message || '').slice(0, 240) }));
    return res.status(500).json({ error: 'Kunne ikke hente saken' });
  }
}
