import { isAdminRequest } from '../../../lib/backofficeAuth';
import { listRecurringHotspots, hasSupabaseConfig } from '../../../lib/supabaseRest';

// Read-only recurrence/seasonal-pattern view: groups the FULL report history
// (any status, any age) into spatial clusters (lib/hotspotAnalysis.js) and
// keeps only spots that recur across multiple distinct seasons/years — i.e.
// chronic problem spots, as opposed to a spot that simply got many reports
// during one short burst. Distinct from /api/backoffice/hot-cases, which
// ranks currently OPEN cases by a heat score right now. No mutations happen
// here — this is pure analysis over existing data.
export default async function handler(req, res) {
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const hotspots = await listRecurringHotspots({ limit: 5000 });
    return res.status(200).json({ hotspots });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Kunne ikke beregne gjentakende steder' });
  }
}
