import { DEFAULT_CENTER, REPORT_STATUS } from '../../lib/config';
import { getPublicReportGeoJson, hasSupabaseConfig } from '../../lib/supabaseRest';

const DEMO_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: DEFAULT_CENTER },
      properties: {
        id: 'demo-1',
        status: REPORT_STATUS.NEW,
        category: 'Farlig kryss',
        description: 'Demo-punkt. Koble til Supabase for ekte innmeldinger.',
        created_at: '2026-01-01T12:00:00.000Z',
      },
    },
  ],
  meta: { demo: true },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    return res.status(200).json(DEMO_GEOJSON);
  }

  try {
    const geojson = await getPublicReportGeoJson();
    return res.status(200).json({ ...geojson, meta: { demo: false } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente kartdata' });
  }
}
