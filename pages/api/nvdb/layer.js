import { getNvdbLayerGeoJson, NVDB_LAYER_TYPES } from '../../../lib/nvdb';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const { type, bbox } = req.query;

  if (!NVDB_LAYER_TYPES[type]) {
    return res.status(400).json({ error: 'Ukjent NVDB-lag' });
  }

  if (!bbox || String(bbox).split(',').length !== 4) {
    return res.status(400).json({ error: 'bbox må være minLng,minLat,maxLng,maxLat' });
  }

  try {
    const geojson = await getNvdbLayerGeoJson({ type, bbox: String(bbox) });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json(geojson);
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'Kunne ikke hente NVDB-lag' });
  }
}
