import { createBikeTrip, getCompetition, hasSupabaseConfig } from '../../lib/supabaseRest';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Ikke konfigurert' });
  }

  const { competitionId, club, helmet, distanceM, durationS, cells, path, tripToken } = req.body || {};

  if (!competitionId) return res.status(400).json({ error: 'Mangler konkurranse' });

  try {
    const competition = await getCompetition(competitionId);
    if (!competition || !competition.active) {
      return res.status(404).json({ error: 'Konkurransen er ikke aktiv' });
    }

    const clubName = String(club || '').trim();
    const matchedClub = competition.clubs.find((entry) => entry.name === clubName);
    if (competition.clubs.length && !matchedClub) {
      return res.status(400).json({ error: 'Velg en klubb fra listen' });
    }

    await createBikeTrip({
      competitionId,
      club: clubName,
      helmet: Boolean(helmet),
      distanceM,
      durationS,
      cells: Array.isArray(cells) ? cells : [],
      path: Array.isArray(path) ? path : [],
      tripToken: tripToken || null,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lagre sykkelturen' });
  }
}
