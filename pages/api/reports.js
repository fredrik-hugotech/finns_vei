import { DEFAULT_CENTER, REPORT_STATUS } from '../../lib/config';
import { getPublicReportGeoJson, hasSupabaseConfig } from '../../lib/supabaseRest';

const DEMO_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'demo-1',
      geometry: { type: 'Point', coordinates: DEFAULT_CENTER },
      properties: {
        id: 'demo-1',
        report_id: 'demo-1',
        support_count: 0,
        image_urls: [],
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
    const features = geojson.features || [];
    const featuresWithReportId = features.filter((feature) => feature.id && feature.properties?.id && feature.properties?.report_id).length;
    const featuresWithSupportCount = features.filter((feature) => feature.properties && Object.prototype.hasOwnProperty.call(feature.properties, 'support_count')).length;
    // Most-requested endpoint (every map view). Short CDN cache absorbs
    // bursts of concurrent map loads while still surfacing a user's own
    // just-submitted report on the map almost immediately.
    //
    // `?fresh=1` is a narrow escape hatch for the post-submission "view case"
    // flow (see handleViewCase in pages/index.js): without it, a concurrent
    // request from another client in the preceding ~8s can leave the CDN
    // serving stale pre-submission data on both of that flow's attempts, so
    // the reporter's own just-submitted pin silently fails to open. Normal
    // map loads never send this param, so their caching is unchanged.
    if (!req.query.fresh) {
      res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=60');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    return res.status(200).json({
      ...geojson,
      meta: {
        demo: false,
        featureCount: features.length,
        featuresWithReportId,
        featuresWithSupportCount,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente kartdata' });
  }
}
