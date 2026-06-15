import { listCompetitions, hasSupabaseConfig } from '../../../lib/supabaseRest';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    return res.status(200).json({ competitions: [] });
  }

  try {
    const competitions = await listCompetitions({ activeOnly: true });
    return res.status(200).json({ competitions });
  } catch (error) {
    // Additive feature: before the `competitions` table exists (or on any read
    // error) return an empty list rather than surfacing an error to the map.
    console.error(error);
    return res.status(200).json({ competitions: [] });
  }
}
