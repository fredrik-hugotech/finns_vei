import { createBikeTrip, getCompetition, hasSupabaseConfig } from '../../lib/supabaseRest';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Ikke konfigurert' });
  }

  const { competitionId, club, helmet, origin, destination, tripToken } = req.body || {};

  if (!competitionId) return res.status(400).json({ error: 'Mangler konkurranse' });
  if (!origin || !Number.isFinite(Number(origin.lat)) || !Number.isFinite(Number(origin.lng))) {
    return res.status(400).json({ error: 'Mangler startsted' });
  }

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

    // The destination is the actual venue/field the child cycled to (picked per
    // trip on the map) — a public place, stored precisely. A club's optional
    // registered coordinate is only a fallback.
    const dest = (destination && Number.isFinite(Number(destination.lat)) && Number.isFinite(Number(destination.lng)))
      ? { lat: Number(destination.lat), lng: Number(destination.lng), name: clubName || (destination.name || '') }
      : (matchedClub && Number.isFinite(Number(matchedClub.lat))
        ? { lat: matchedClub.lat, lng: matchedClub.lng, name: matchedClub.name }
        : null);

    await createBikeTrip({
      competitionId,
      club: clubName,
      helmet: Boolean(helmet),
      origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
      destination: dest,
      tripToken: tripToken || null,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lagre sykkelturen' });
  }
}
