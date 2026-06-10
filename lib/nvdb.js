const DEFAULT_NVDB_BASE_URL = 'https://nvdbapiles.atlas.vegvesen.no';
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

export const NVDB_LAYER_TYPES = {
  speed_limit: {
    label: 'Fartsgrense',
    objectTypeId: 105,
    propertyNames: ['Fartsgrense', 'fartsgrense'],
  },
  gangfelt: {
    label: 'Gangfelt',
    objectTypeId: 174,
    propertyNames: [],
  },
  aadt: {
    label: 'ÅDT',
    objectTypeId: 540,
    propertyNames: ['ÅDT, total', 'ÅDT', 'Trafikkmengde'],
  },
};

function nvdbBaseUrl() {
  return (process.env.NVDB_BASE_URL || DEFAULT_NVDB_BASE_URL).replace(/\/$/, '');
}

function headers() {
  return {
    Accept: 'application/json',
    'X-Client': process.env.NVDB_X_CLIENT || 'finns-vei-vercel',
  };
}

function withTimeout(ms = 6500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

async function nvdbGet(path, params = {}, cacheKey = null) {
  const url = new URL(`${nvdbBaseUrl()}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });

  const key = cacheKey || url.toString();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const timeout = withTimeout();
  try {
    const response = await fetch(url, { headers: headers(), signal: timeout.signal });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`NVDB request failed (${response.status}): ${text}`);
    }
    const value = await response.json();
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } finally {
    timeout.cancel();
  }
}

function parseWkt(wkt = '') {
  const normalized = String(wkt).trim();
  const type = normalized.split(/[\s(]/)[0]?.toUpperCase();
  const body = normalized.replace(/^[A-Z]+\s+Z?\s*/i, '').trim();

  if (type === 'POINT') {
    const coords = body.replace(/[()]/g, '').trim().split(/\s+/).slice(0, 2).map(Number);
    return Number.isFinite(coords[0]) && Number.isFinite(coords[1]) ? { type: 'Point', coordinates: coords } : null;
  }

  if (type === 'LINESTRING') {
    const coordinates = body.replace(/[()]/g, '').split(',').map((pair) => pair.trim().split(/\s+/).slice(0, 2).map(Number));
    return coordinates.length ? { type: 'LineString', coordinates } : null;
  }

  if (type === 'POLYGON') {
    const rings = body.replace(/^\(\(/, '').replace(/\)\)$/, '').split('),(').map((ring) => ring.split(',').map((pair) => pair.trim().split(/\s+/).slice(0, 2).map(Number)));
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }

  return null;
}

function findPropertyValue(object, names = []) {
  const properties = object?.egenskaper || object?.properties || [];
  if (!Array.isArray(properties)) return null;

  const normalizedNames = names.map((name) => name.toLowerCase());
  const match = properties.find((property) => normalizedNames.includes(String(property.navn || property.name || '').toLowerCase()));
  return match?.verdi ?? match?.value ?? null;
}

function objectToFeature(object, layerType) {
  const geometry = object?.geometri?.geojson || parseWkt(object?.geometri?.wkt || object?.lokasjon?.geometri?.wkt);
  if (!geometry) return null;

  const config = NVDB_LAYER_TYPES[layerType] || {};
  const value = findPropertyValue(object, config.propertyNames || []);

  return {
    type: 'Feature',
    geometry,
    properties: {
      id: object.id,
      layerType,
      typeName: object?.metadata?.type?.navn || config.label || layerType,
      value,
      label: value ? `${config.label}: ${value}` : (config.label || layerType),
    },
  };
}

function bboxToPolygon(bbox) {
  const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
    throw new Error('bbox må være minLng,minLat,maxLng,maxLat');
  }
  return `${minLng} ${minLat},${maxLng} ${minLat},${maxLng} ${maxLat},${minLng} ${maxLat},${minLng} ${minLat}`;
}

export async function getNvdbLayerGeoJson({ type, bbox }) {
  const config = NVDB_LAYER_TYPES[type];
  if (!config) throw new Error('Ukjent NVDB-lag');

  const params = {
    polygon: bboxToPolygon(bbox),
    srid: 4326,
    inkluder: 'metadata,egenskaper,lokasjon,geometri',
    inkluderAntall: 'false',
    antall: 100,
  };

  const payload = await nvdbGet(`/vegobjekter/api/v4/vegobjekter/${config.objectTypeId}`, params, `layer:${type}:${bbox}`);
  const objects = payload?.objekter || payload?.objects || (Array.isArray(payload) ? payload : []);
  return { type: 'FeatureCollection', features: objects.map((object) => objectToFeature(object, type)).filter(Boolean) };
}

export async function getRoadPosition({ lat, lng }) {
  const matches = await nvdbGet('/vegnett/api/v4/posisjon', {
    lat,
    lon: lng,
    maks_avstand: 200,
    srid: 4326,
  }, `position:${lat.toFixed(6)}:${lng.toFixed(6)}`);

  return Array.isArray(matches) ? matches[0] : null;
}

async function getNearestObjectValue({ type, lat, lng }) {
  const delta = 0.0018;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
  const geojson = await getNvdbLayerGeoJson({ type, bbox });
  const feature = geojson.features[0];
  return feature?.properties?.value ?? null;
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function firstCoordinate(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry.coordinates;
  if (geometry.type === 'LineString') return geometry.coordinates[0];
  if (geometry.type === 'Polygon') return geometry.coordinates[0]?.[0];
  return null;
}

async function nearestCrossingDistance({ lat, lng }) {
  const delta = 0.0027;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
  const geojson = await getNvdbLayerGeoJson({ type: 'gangfelt', bbox });
  const distances = geojson.features
    .map((feature) => firstCoordinate(feature.geometry))
    .filter(Boolean)
    .map(([featureLng, featureLat]) => haversineMeters({ lat, lng }, { lat: featureLat, lng: featureLng }));

  return distances.length ? Math.round(Math.min(...distances)) : null;
}

function roadDataFromPosition(position) {
  const reference = position?.vegsystemreferanse;
  const system = reference?.vegsystem || {};
  const managers = position?.vegforvaltere || position?.lokasjon?.vegforvaltere || [];
  const manager = Array.isArray(managers) ? managers[0] : null;

  return {
    road_owner: manager?.vegforvalter || manager?.navn || null,
    road_authority: manager?.vegforvalter || manager?.navn || null,
    road_category: system.vegkategori || null,
    road_number: system.nummer ? String(system.nummer) : null,
    road_reference: reference?.kortform || null,
  };
}

export async function enrichPoint({ lat, lng }) {
  const position = await getRoadPosition({ lat, lng });
  if (!position) return null;

  const [speedLimit, aadt, crossingDistance] = await Promise.allSettled([
    getNearestObjectValue({ type: 'speed_limit', lat, lng }),
    getNearestObjectValue({ type: 'aadt', lat, lng }),
    nearestCrossingDistance({ lat, lng }),
  ]);

  return {
    ...roadDataFromPosition(position),
    speed_limit: speedLimit.status === 'fulfilled' ? speedLimit.value : null,
    aadt: aadt.status === 'fulfilled' ? aadt.value : null,
    nearest_crossing_distance_m: crossingDistance.status === 'fulfilled' ? crossingDistance.value : null,
  };
}
