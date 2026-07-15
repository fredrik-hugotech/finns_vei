import { emptyNvdbFeatureCollection, getNvdbLayerGeoJson, NVDB_LAYER_TYPES } from '../../../lib/nvdb';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

// Public, unauthenticated GET fired on every map pan/zoom - proxies the
// external NVDB API, so rate limit it the same way as the MET Norway weather
// proxy to keep a panning script from hammering NVDB.
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

function logLayer(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/nvdb/layer', event, ...details }));
}


function compactDebugFeatures(features = []) {
  return features.slice(0, 3).map((feature) => ({
    geometry: feature.geometry || null,
    properties: {
      id: feature.properties?.id ?? null,
      year: feature.properties?.year ?? null,
      date: feature.properties?.date ?? null,
      severity: feature.properties?.severity ?? null,
      accident_type: feature.properties?.accident_type ?? null,
      source: feature.properties?.source ?? null,
    },
  }));
}

const MIN_ACCIDENT_FETCH_ZOOM = 12;

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

  const rateLimit = checkRequestRateLimit(req, 'nvdb-layer', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const { type, bbox, zoom, debug } = req.query;

  if (!NVDB_LAYER_TYPES[type]) {
    return res.status(400).json({ error: 'Ukjent NVDB-lag' });
  }

  if (!bbox || String(bbox).split(',').length !== 4) {
    return res.status(400).json({ error: 'bbox må være minLng,minLat,maxLng,maxLat' });
  }

  const numericZoom = Number(zoom);
  const span = bboxSpan(bbox);

  if (type === 'accidents') {
    if (Number.isFinite(numericZoom) && numericZoom < MIN_ACCIDENT_FETCH_ZOOM) {
      return res.status(200).json(emptyNvdbFeatureCollection({ reason: 'zoom_too_low', message: 'Zoom inn for å se ulykker', rawObjectCount: 0, featureCount: 0, pointFeatureCount: 0, invalidGeometryCount: 0, firstGeometry: null, coordinateRange: null, derivedBbox: null, bbox: String(bbox), zoom: Number.isFinite(numericZoom) ? numericZoom : null }));
    }
    const maxSpan = Number.isFinite(numericZoom) && numericZoom < 13
      ? { lng: 0.3, lat: 0.2 }
      : { lng: 0.12, lat: 0.08 };
    if (span && (span.lng > maxSpan.lng || span.lat > maxSpan.lat)) {
      return res.status(200).json(emptyNvdbFeatureCollection({ reason: 'bbox_too_broad', message: 'Zoom inn for å se ulykker', rawObjectCount: 0, featureCount: 0, pointFeatureCount: 0, invalidGeometryCount: 0, firstGeometry: null, coordinateRange: null, derivedBbox: null, bbox: String(bbox), zoom: Number.isFinite(numericZoom) ? numericZoom : null }));
    }
  }

  logLayer('requested', { type, bbox: String(bbox), zoom: Number.isFinite(numericZoom) ? numericZoom : null });

  try {
    const geojson = await getNvdbLayerGeoJson({ type, bbox: String(bbox), zoom: Number.isFinite(numericZoom) ? numericZoom : null });
    logLayer('completed', {
      type,
      bbox: String(bbox),
      rawObjectCount: geojson.meta?.rawObjectCount ?? null,
      featureCount: geojson.features?.length ?? 0,
      pointFeatureCount: geojson.meta?.pointFeatureCount ?? null,
      invalidGeometryCount: geojson.meta?.invalidGeometryCount ?? null,
      firstGeometry: geojson.meta?.firstGeometry || null,
      coordinateRange: geojson.meta?.coordinateRange || null,
      derivedBbox: geojson.meta?.derivedBbox || null,
      fallbackPath: geojson.meta?.fallbackPath || null,
    });
    if (String(debug) === '1') {
      geojson.meta = {
        ...geojson.meta,
        debugFeatures: compactDebugFeatures(geojson.features || []),
      };
    }
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
        pointFeatureCount: 0,
        invalidGeometryCount: 0,
        firstGeometry: null,
        coordinateRange: null,
        derivedBbox: null,
        bbox: String(bbox),
        zoom: Number.isFinite(numericZoom) ? numericZoom : null,
      }));
    }

    return res.status(502).json({ error: 'Kunne ikke hente NVDB-lag' });
  }
}
