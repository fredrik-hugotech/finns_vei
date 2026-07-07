import { isAdminRequest } from '../../../lib/backofficeAuth';
import { getCompetitionStats, listCompetitions, hasSupabaseConfig } from '../../../lib/supabaseRest';

// Internal: the density heatmap geojson + leaderboard for a competition.
// Gated by BACKOFFICE_SECRET so the "where children cycle" data stays internal.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) {
      // No id → return the list so the internal page can offer a picker.
      const competitions = await listCompetitions({ activeOnly: false });
      return res.status(200).json({ competitions });
    }
    const mode = typeof req.query.mode === 'string' ? req.query.mode : null;
    const stats = await getCompetitionStats(id, { mode });
    if (!stats) return res.status(404).json({ error: 'Fant ikke konkurransen' });
    return res.status(200).json(stats);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Kunne ikke hente data' });
  }
}
