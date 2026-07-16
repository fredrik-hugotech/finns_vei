import { isAdminRequest } from '../../../lib/backofficeAuth';
import { getPublicReportGeoJson, hasSupabaseConfig } from '../../../lib/supabaseRest';

// Internal, staff-only stats source. The public /statistikk page was removed
// on 2026-07-12 ("public stats aren't wanted; build internal stats
// separately") — this route serves exactly that internal replacement, now
// access-controlled behind isAdminRequest instead of open to everyone.
//
// It returns the same contact-info-stripped GeoJSON FeatureCollection that
// /api/reports exposes (report_public_geojson / stripPrivateProperties in
// lib/supabaseRest.js), so there's no new privacy exposure — the client
// aggregates it into charts exactly as the old public page did.
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
    const geojson = await getPublicReportGeoJson();
    const features = geojson.features || [];
    return res.status(200).json({
      ...geojson,
      meta: { demo: false, featureCount: features.length },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente statistikk' });
  }
}
