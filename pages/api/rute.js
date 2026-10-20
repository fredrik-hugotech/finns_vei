import { checkRequestRateLimit } from '../../lib/rateLimit';

// One leg of a drawn route (/tegn-rute), routed for children: on a bike it
// prefers gang- og sykkelveier over roads, on foot it prefers paths and
// sidewalks. Uses Valhalla on OpenStreetMap data (FOSSGIS public server),
// where Norwegian cycle paths are well mapped — Mapbox's cycling profile
// often sends riders along the road (even E18/E39) instead.
//
// Called server-side so the user's IP never reaches the routing service and
// the provider can be swapped here alone. Nothing is stored. On any failure
// this answers 502 and the client falls back to Mapbox Directions.

const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';
const TIMEOUT_MS = 6000;
const MAX_LEG_M = 20000; // straight-line cap per leg
const RATE_LIMIT = 150;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const COSTING = {
  sykkel: { costing: 'bicycle', options: { bicycle: { bicycle_type: 'Hybrid', use_roads: 0.2, avoid_bad_surfaces: 0.25 } } },
  gange: { costing: 'pedestrian', options: { pedestrian: { walkway_factor: 0.8, sidewalk_factor: 0.8 } } },
};

function parsePoint(value) {
  const [lng, lat] = String(value || '').split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  // Norway and a margin around it.
  if (lat < 57 || lat > 72 || lng < 3 || lng > 32) return null;
  return { lng, lat };
}

function straightMeters(a, b) {
  const dLat = (b.lat - a.lat) * 111320;
  const dLng = (b.lng - a.lng) * 111320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

// Valhalla returns its geometry as a precision-6 encoded polyline.
function decodePolyline6(str) {
  const out = [];
  let index = 0; let lat = 0; let lng = 0;
  while (index < str.length) {
    for (let which = 0; which < 2; which += 1) {
      let shift = 0; let result = 0; let byte;
      do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lng += delta;
    }
    out.push([Number((lng / 1e6).toFixed(6)), Number((lat / 1e6).toFixed(6))]);
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }
  const rateLimit = checkRequestRateLimit(req, 'rute', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  const from = parsePoint(req.query.from);
  const to = parsePoint(req.query.to);
  const profile = COSTING[req.query.mode === 'gange' ? 'gange' : 'sykkel'];
  if (!from || !to) return res.status(400).json({ error: 'Ugyldige punkter' });
  if (straightMeters(from, to) > MAX_LEG_M) return res.status(400).json({ error: 'For langt mellom punktene' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(VALHALLA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Finns Fairway (finnsvei.no)' },
      body: JSON.stringify({
        locations: [{ lon: from.lng, lat: from.lat }, { lon: to.lng, lat: to.lat }],
        costing: profile.costing,
        costing_options: profile.options,
        units: 'kilometers',
      }),
      signal: controller.signal,
    });
    if (!response.ok) return res.status(502).json({ error: 'Fant ingen rute' });
    const data = await response.json();
    const shape = data?.trip?.legs?.[0]?.shape;
    const coords = shape ? decodePolyline6(shape) : [];
    if (coords.length < 2) return res.status(502).json({ error: 'Fant ingen rute' });
    // Same two points always give the same answer — let the edge cache it.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ coords, source: 'osm' });
  } catch (_e) {
    return res.status(502).json({ error: 'Rutetjenesten svarer ikke' });
  } finally {
    clearTimeout(timer);
  }
}
