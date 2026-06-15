import { getCompetitionStats, hasSupabaseConfig } from '../../../lib/supabaseRest';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    return res.status(404).json({ error: 'Ikke konfigurert' });
  }

  const id = String(req.query.id || '');
  try {
    const stats = await getCompetitionStats(id);
    if (!stats) return res.status(404).json({ error: 'Fant ikke konkurransen' });
    return res.status(200).json(stats);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente konkurransen' });
  }
}
