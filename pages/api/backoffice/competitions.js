import { isAdminRequest } from '../../../lib/backofficeAuth';
import {
  listCompetitions,
  createCompetition,
  updateCompetition,
  hasSupabaseConfig,
} from '../../../lib/supabaseRest';

export default async function handler(req, res) {
  if (!(await isAdminRequest(req))) {
    // Safe diagnostic: reveal only whether a secret is configured (boolean),
    // never the value, so we can tell "no secret in Vercel" from "wrong password".
    const secretConfigured = Boolean(process.env.BACKOFFICE_SECRET || process.env.DEBUG_SECRET);
    return res.status(403).json({
      error: secretConfigured
        ? 'Feil passord – verdien matcher ikke BACKOFFICE_SECRET i Vercel.'
        : 'Ingen BACKOFFICE_SECRET er aktiv i produksjon. Legg den til i Vercel (Production) og redeploy.',
      code: 'forbidden',
      secretConfigured,
    });
  }
  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured', code: 'missing_supabase_config' });
  }

  try {
    if (req.method === 'GET') {
      const competitions = await listCompetitions({ activeOnly: false });
      return res.status(200).json({ competitions });
    }

    if (req.method === 'POST') {
      const competition = await createCompetition(req.body || {});
      return res.status(201).json({ competition });
    }

    if (req.method === 'PATCH') {
      const { id, ...patch } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id', code: 'missing_id' });
      const competition = await updateCompetition(id, patch);
      return res.status(200).json({ competition });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Backoffice competition request failed', code: 'unknown' });
  }
}
