import { emptyNvdbFeatureCollection, getNvdbLayerGeoJson, NVDB_LAYER_TYPES } from '../../../lib/nvdb';

function logLayer(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/nvdb/layer', event, ...details }));
}

function bboxSpan(bbox) {
  const [minLng, minLat, maxLng, maxLat] = String(bbox).split(',').map(Number);
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return { lng: Math.abs(maxLng - minLng), lat: Math.abs(maxLat - minLat) };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const { type, bbox, zoom } = req.query;

  if (!NVDB_LAYER_TYPES[type]) {
    return res.status(400).json({ error: 'Ukjent NVDB-lag' });
  }

  if (!bbox || String(bbox).split(',').length !== 4) {
    return res.status(400).json({ error: 'bbox må være minLng,minLat,maxLng,maxLat' });
  }

  const numericZoom = Number(zoom);
  const span = bboxSpan(bbox);

  if (type === 'accidents') {
    if (Number.isFinite(numericZoom) && numericZoom < 13) {
      return res.status(200).json(emptyNvdbFeatureCollection({ reason: 'zoom_too_low', message: 'Zoom inn for å se ulykker', rawObjectCount: 0, featureCount: 0 }));
    }
    if (span && (span.lng > 0.12 || span.lat > 0.08)) {
      return res.status(200).json(emptyNvdbFeatureCollection({ reason: 'bbox_too_broad', message: 'Zoom inn for å se ulykker', rawObjectCount: 0, featureCount: 0 }));
    }
  }

  logLayer('requested', { type, bbox: String(bbox), zoom: Number.isFinite(numericZoom) ? numericZoom : null });

  try {
    const geojson = await getNvdbLayerGeoJson({ type, bbox: String(bbox) });
    logLayer('completed', {
      type,
      bbox: String(bbox),
      rawObjectCount: geojson.meta?.rawObjectCount ?? null,
      featureCount: geojson.features?.length ?? 0,
      fallbackPath: geojson.meta?.fallbackPath || null,
    });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json(geojson);
  } catch (error) {
    logLayer('failed', { type, bbox: String(bbox), name: error?.name, message: String(error?.message || '').slice(0, 300) });

    if (error?.isNvdbUpstreamUnavailable) {
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return res.status(200).json(emptyNvdbFeatureCollection({
        degraded: true,
        reason: 'nvdb_upstream_unavailable',
        message: 'NVDB er midlertidig utilgjengelig fra denne runtime. Prøv i Vercel eller sett NVDB_BASE_URL/NVDB_FALLBACK_BASE_URLS.',
        rawObjectCount: 0,
        featureCount: 0,
      }));
    }

    return res.status(502).json({ error: 'Kunne ikke hente NVDB-lag' });
  }
}
