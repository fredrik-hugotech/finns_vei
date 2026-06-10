const OFFICIAL_NVDB_BASE_URL = 'https://nvdbapiles.atlas.vegvesen.no';
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 6500;
const DEFAULT_RETRIES = 2;
const DEFAULT_POSITION_MAX_DISTANCE_M = 500;
const cache = new Map();

function logNvdb(event, details = {}) {
  console.log(JSON.stringify({ scope: 'nvdb', event, ...details }));
}

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function retryCount() {
  const configured = Number(process.env.NVDB_RETRY_COUNT);
  return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : DEFAULT_RETRIES;
}

function timeoutMs() {
  const configured = Number(process.env.NVDB_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_TIMEOUT_MS;
}

function positionMaxDistanceMeters() {
  const configured = Number(process.env.NVDB_POSITION_MAX_DISTANCE_M);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_POSITION_MAX_DISTANCE_M;
}

function layerSearchRadiusMeters() {
  const configured = Number(process.env.NVDB_LAYER_SEARCH_RADIUS_M);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 350;
}

function crossingSearchRadiusMeters() {
  const configured = Number(process.env.NVDB_CROSSING_SEARCH_RADIUS_M);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 500;
}

function accidentSearchRadiusMeters() {
  const configured = Number(process.env.NVDB_ACCIDENT_SEARCH_RADIUS_M);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 500;
}

function accidentReportRadiusMeters() {
  const configured = Number(process.env.NVDB_ACCIDENT_REPORT_RADIUS_M);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 20;
}

function accidentObjectTypeId() {
  const configured = Number(process.env.NVDB_ACCIDENT_OBJECT_TYPE_ID);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 570;
}

export function nvdbEnvStatus() {
  return {
    hasNvdbXClient: Boolean(process.env.NVDB_X_CLIENT),
    nvdbBaseUrl: cleanBaseUrl(process.env.NVDB_BASE_URL || OFFICIAL_NVDB_BASE_URL),
    nvdbRetryCount: retryCount(),
    nvdbTimeoutMs: timeoutMs(),
    nvdbPositionMaxDistanceM: positionMaxDistanceMeters(),
    nvdbAccidentSearchRadiusM: accidentSearchRadiusMeters(),
    nvdbAccidentReportRadiusM: accidentReportRadiusMeters(),
    hasNvdbAccidentObjectTypeConfigured: Boolean(process.env.NVDB_ACCIDENT_OBJECT_TYPE_ID),
    nvdbAccidentObjectTypeId: accidentObjectTypeId(),
  };
}

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
  accidents: {
    label: 'Ulykker',
    objectTypeId: accidentObjectTypeId(),
    propertyNames: ['Alvorligste skadegrad', 'alvorligsteSkadegrad', 'Alvorlighetsgrad', 'alvorlighetsgrad'],
  },
};

export class NvdbUpstreamUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'NvdbUpstreamUnavailableError';
    this.cause = cause;
    this.isNvdbUpstreamUnavailable = true;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function nvdbBaseUrls() {
  const configuredPrimary = cleanBaseUrl(process.env.NVDB_BASE_URL || OFFICIAL_NVDB_BASE_URL);
  const configuredFallbacks = String(process.env.NVDB_FALLBACK_BASE_URLS || '')
    .split(',')
    .map(cleanBaseUrl);

  return unique([configuredPrimary, ...configuredFallbacks, OFFICIAL_NVDB_BASE_URL]);
}

function headers() {
  return {
    Accept: 'application/json',
    'X-Client': process.env.NVDB_X_CLIENT || 'finns-vei-vercel',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(ms = timeoutMs()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

function isTransientNetworkError(error) {
  const code = error?.cause?.code || error?.code;
  return error?.name === 'AbortError'
    || code === 'EAI_AGAIN'
    || code === 'ENOTFOUND'
    || code === 'ECONNRESET'
    || code === 'ETIMEDOUT'
    || String(error?.message || '').includes('fetch failed');
}

function buildUrl(baseUrl, path, params) {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url;
}

async function fetchJsonWithRetry(url) {
  const attempts = retryCount() + 1;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeout = withTimeout();
    try {
      logNvdb('request_started', { url: url.toString(), attempt: attempt + 1, attempts });
      const response = await fetch(url, { headers: headers(), signal: timeout.signal });
      logNvdb('response_status', { url: url.toString(), status: response.status, ok: response.ok });
      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`NVDB request failed (${response.status}): ${text}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      logNvdb('request_error', {
        url: url.toString(),
        attempt: attempt + 1,
        name: error?.name,
        code: error?.cause?.code || error?.code,
        message: String(error?.message || '').slice(0, 240),
        transient: isTransientNetworkError(error),
      });
      if (!isTransientNetworkError(error) || attempt === attempts - 1) break;
      await sleep(150 * (attempt + 1));
    } finally {
      timeout.cancel();
    }
  }

  if (isTransientNetworkError(lastError)) {
    throw new NvdbUpstreamUnavailableError(`NVDB upstream unavailable for ${url.hostname}`, lastError);
  }

  throw lastError;
}

async function nvdbGet(path, params = {}, cacheKey = null) {
  const baseUrls = nvdbBaseUrls();
  const key = cacheKey || `${path}:${JSON.stringify(params)}:${baseUrls.join('|')}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  let lastError = null;
  for (const baseUrl of baseUrls) {
    const url = buildUrl(baseUrl, path, params);
    try {
      const value = await fetchJsonWithRetry(url);
      logNvdb('request_completed', { baseUrl, path });
      cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
      return value;
    } catch (error) {
      lastError = error;
      logNvdb('base_failed', { baseUrl, path, name: error?.name, message: String(error?.message || '').slice(0, 240) });
      if (!error?.isNvdbUpstreamUnavailable) throw error;
    }
  }

  throw lastError;
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

function normalizeGeometry(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{')) {
      try {
        return normalizeGeometry(JSON.parse(trimmed));
      } catch (_error) {
        return parseWkt(trimmed);
      }
    }
    return parseWkt(trimmed);
  }
  if (value.type === 'Feature') return normalizeGeometry(value.geometry);
  if (value.type && value.coordinates) return value;
  return null;
}

function objectGeometry(object) {
  return normalizeGeometry(
    object?.geometri?.geojson
    || object?.geometri?.wkt
    || object?.geometri
    || object?.lokasjon?.geometri?.geojson
    || object?.lokasjon?.geometri?.wkt
    || object?.lokasjon?.geometri,
  );
}

function objectProperties(object) {
  const properties = object?.egenskaper || object?.properties || [];
  return Array.isArray(properties) ? properties : [];
}

function propertyName(property) {
  return String(property?.navn || property?.name || '').toLowerCase();
}

function propertyValue(property) {
  return property?.verdi ?? property?.value ?? property?.enum_verdi ?? property?.tekst ?? null;
}

function findPropertyValue(object, names = []) {
  const properties = objectProperties(object);
  const normalizedNames = names.map((name) => name.toLowerCase());
  const match = properties.find((property) => normalizedNames.includes(propertyName(property)));
  return match ? propertyValue(match) : null;
}

function findFlexiblePropertyValue(object, names = []) {
  const properties = objectProperties(object);
  const normalizedNames = names.map((name) => name.toLowerCase());
  const match = properties.find((property) => {
    const name = propertyName(property);
    return normalizedNames.some((candidate) => name === candidate || name.includes(candidate));
  });
  return match ? propertyValue(match) : null;
}


function firstFlexibleValue(object, candidates = []) {
  for (const names of candidates) {
    const value = findFlexiblePropertyValue(object, Array.isArray(names) ? names : [names]);
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function accidentFeatureProperties(object) {
  const date = firstFlexibleValue(object, ['ulykkesdato', 'dato', 'tidspunkt']);
  const year = date ? String(date).match(/(19|20)\d{2}/)?.[0] || null : accidentYear(object);
  const severityValue = firstFlexibleValue(object, ['alvorligste skadegrad', 'alvorligsteskadegrad', 'alvorlighetsgrad', 'skadegrad']);
  const accidentType = firstFlexibleValue(object, ['ulykkestype', 'uhellstype', 'ulykkeskategori', 'uhellskategori']);
  const description = firstFlexibleValue(object, ['beskrivelse', 'ulykkesbeskrivelse', 'uhellskode', 'hendelsesforløp']);
  const roadReference = object?.lokasjon?.vegsystemreferanser?.[0]?.kortform
    || object?.vegsystemreferanse?.kortform
    || object?.vegsegmenter?.[0]?.vegsystemreferanse?.kortform
    || null;

  return {
    id: object.id,
    source: 'NVDB',
    layerType: 'accidents',
    raw_object_type_name: object?.metadata?.type?.navn || 'Trafikkulykke',
    ...(accidentType ? { accident_type: String(accidentType) } : {}),
    ...(severityValue ? { severity: String(severityValue) } : {}),
    ...(year ? { year: String(year) } : {}),
    ...(date ? { date: String(date) } : {}),
    ...(roadReference ? { road_reference: String(roadReference) } : {}),
    ...(description ? { description: String(description) } : {}),
    label: [year, severityValue, accidentType].filter(Boolean).join(' · ') || 'Trafikkulykke',
  };
}


function normalizeLonLatPair(lng, lat) {
  const lon = Number(lng);
  const latitude = Number(lat);
  return Number.isFinite(lon) && Number.isFinite(latitude) && Math.abs(lon) <= 180 && Math.abs(latitude) <= 90
    ? [lon, latitude]
    : null;
}

function utm33ToLonLat(easting, northing) {
  const x = Number(easting);
  const y = Number(northing);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < -200000 || x > 900000 || y < 6000000 || y > 8000000) return null;

  const a = 6378137;
  const e = 0.081819191;
  const e1sq = 0.006739497;
  const k0 = 0.9996;
  const arc = y / k0;
  const mu = arc / (a * (1 - (e ** 2) / 4 - (3 * e ** 4) / 64 - (5 * e ** 6) / 256));
  const ei = (1 - Math.sqrt(1 - e ** 2)) / (1 + Math.sqrt(1 - e ** 2));
  const ca = (3 * ei) / 2 - (27 * ei ** 3) / 32;
  const cb = (21 * ei ** 2) / 16 - (55 * ei ** 4) / 32;
  const cc = (151 * ei ** 3) / 96;
  const cd = (1097 * ei ** 4) / 512;
  const phi1 = mu + ca * Math.sin(2 * mu) + cb * Math.sin(4 * mu) + cc * Math.sin(6 * mu) + cd * Math.sin(8 * mu);
  const n0 = a / Math.sqrt(1 - (e * Math.sin(phi1)) ** 2);
  const r0 = (a * (1 - e ** 2)) / ((1 - (e * Math.sin(phi1)) ** 2) ** 1.5);
  const fact1 = n0 * Math.tan(phi1) / r0;
  const a1 = 500000 - x;
  const dd0 = a1 / (n0 * k0);
  const fact2 = dd0 ** 2 / 2;
  const t0 = Math.tan(phi1) ** 2;
  const q0 = e1sq * Math.cos(phi1) ** 2;
  const fact3 = (5 + 3 * t0 + 10 * q0 - 4 * q0 ** 2 - 9 * e1sq) * dd0 ** 4 / 24;
  const fact4 = (61 + 90 * t0 + 298 * q0 + 45 * t0 ** 2 - 252 * e1sq - 3 * q0 ** 2) * dd0 ** 6 / 720;
  const lat = (phi1 - fact1 * (fact2 + fact3 + fact4)) * 180 / Math.PI;
  const lof1 = dd0;
  const lof2 = (1 + 2 * t0 + q0) * dd0 ** 3 / 6;
  const lof3 = (5 - 2 * q0 + 28 * t0 - 3 * q0 ** 2 + 8 * e1sq + 24 * t0 ** 2) * dd0 ** 5 / 120;
  const lon = 15 - ((lof1 + lof2 + lof3) / Math.cos(phi1)) * 180 / Math.PI;
  return normalizeLonLatPair(lon, lat);
}

function lonLatFromObjectFields(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = lonLatFromObjectFields(item);
      if (found) return found;
    }
    return null;
  }

  const entries = Object.entries(value);
  const lower = Object.fromEntries(entries.map(([key, val]) => [key.toLowerCase(), val]));
  const lon = lower.lon ?? lower.lng ?? lower.longitude ?? lower.lengdegrad ?? lower.x;
  const lat = lower.lat ?? lower.latitude ?? lower.breddegrad ?? lower.y;
  const direct = normalizeLonLatPair(lon, lat);
  if (direct) return direct;
  const projected = utm33ToLonLat(lon, lat);
  if (projected) return projected;

  for (const [, child] of entries) {
    const found = lonLatFromObjectFields(child);
    if (found) return found;
  }
  return null;
}

function averageCoordinate(coordinates) {
  if (!coordinates.length) return null;
  const sum = coordinates.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return [sum[0] / coordinates.length, sum[1] / coordinates.length];
}

function coordinateInsideBbox(coordinate, bbox) {
  const valid = normalizeLonLatPair(coordinate?.[0], coordinate?.[1]);
  if (!bbox) return Boolean(valid);
  return Boolean(valid)
    && valid[0] >= bbox.minLng
    && valid[0] <= bbox.maxLng
    && valid[1] >= bbox.minLat
    && valid[1] <= bbox.maxLat;
}

function preferredCoordinate(coordinates, bbox) {
  const validCoordinates = coordinates
    .map((coord) => normalizeLonLatPair(coord?.[0], coord?.[1]))
    .filter(Boolean);
  if (!validCoordinates.length) return null;
  const visibleCoordinates = bbox ? validCoordinates.filter((coord) => coordinateInsideBbox(coord, bbox)) : validCoordinates;
  return averageCoordinate(visibleCoordinates.length ? visibleCoordinates : validCoordinates);
}

function representativeLonLatFromGeometry(geometry, bbox = null) {
  const coordinate = preferredCoordinate(allCoordinates(geometry), bbox);
  if (coordinate) return coordinate;

  const projectedCoordinates = allCoordinates(geometry)
    .map((coord) => Array.isArray(coord) ? utm33ToLonLat(coord[0], coord[1]) : null)
    .filter(Boolean);
  return preferredCoordinate(projectedCoordinates, bbox);
}

function accidentPointFeature(object, bbox = null) {
  const fieldCoordinate = lonLatFromObjectFields(object);
  const geometry = objectGeometry(object);
  const coordinate = coordinateInsideBbox(fieldCoordinate, bbox)
    ? fieldCoordinate
    : representativeLonLatFromGeometry(geometry, bbox) || fieldCoordinate;
  const validCoordinate = normalizeLonLatPair(coordinate?.[0], coordinate?.[1]);
  if (!validCoordinate || !coordinateInsideBbox(validCoordinate, bbox)) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: validCoordinate },
    properties: accidentFeatureProperties(object),
  };
}

function objectToFeature(object, layerType) {
  const geometry = objectGeometry(object);
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


function isWgs84Coordinate(coord) {
  return Boolean(normalizeLonLatPair(coord?.[0], coord?.[1]));
}

function representativePointFeature(feature) {
  if (!feature || feature.geometry?.type === 'Point') return null;
  const coordinate = representativeLonLatFromGeometry(feature.geometry);
  if (!coordinate) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coordinate },
    properties: {
      ...feature.properties,
      representativePoint: true,
      label: feature.properties?.label || feature.properties?.typeName || 'NVDB-objekt',
    },
  };
}

function featuresForObject(object, layerType, bbox = null) {
  if (layerType === 'accidents') {
    const accidentFeature = accidentPointFeature(object, bbox);
    return accidentFeature ? [accidentFeature] : [];
  }

  const feature = objectToFeature(object, layerType);
  if (!feature) return [];
  const pointFeature = representativePointFeature(feature);
  return pointFeature ? [feature, pointFeature] : [feature];
}

function bboxValues(bbox) {
  const values = String(bbox).split(',').map(Number);
  if (values.length !== 4 || !values.every(Number.isFinite)) {
    throw new Error('bbox må være minLng,minLat,maxLng,maxLat');
  }
  const [minLng, minLat, maxLng, maxLat] = values;
  return { minLng, minLat, maxLng, maxLat };
}

function bboxToPolygon(bbox) {
  const { minLng, minLat, maxLng, maxLat } = bboxValues(bbox);
  return `POLYGON((${minLng} ${minLat},${maxLng} ${minLat},${maxLng} ${maxLat},${minLng} ${maxLat},${minLng} ${minLat}))`;
}

function pointToBbox({ lat, lng, radiusMeters }) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta]
    .map((value) => value.toFixed(6))
    .join(',');
}

function extractObjects(payload) {
  return payload?.objekter || payload?.objects || (Array.isArray(payload) ? payload : []);
}

export function emptyNvdbFeatureCollection(meta = {}) {
  return { type: 'FeatureCollection', features: [], meta };
}

async function getNvdbObjectsByParams({ type, params, cacheKey, fallbackPath }) {
  const config = NVDB_LAYER_TYPES[type];
  const payload = await nvdbGet(`/vegobjekter/api/v4/vegobjekter/${config.objectTypeId}`, params, cacheKey);
  const objects = extractObjects(payload);
  logNvdb('objects_returned', { type, fallbackPath, rawObjectCount: objects.length });
  return objects;
}

async function getNvdbObjects({ type, bbox, roadReference, point, radiusMeters = layerSearchRadiusMeters(), antall = 100 }) {
  const config = NVDB_LAYER_TYPES[type];
  if (!config) throw new Error('Ukjent NVDB-lag');

  const baseParams = {
    srid: 4326,
    inkluder: 'metadata,egenskaper,lokasjon,geometri',
    inkluderAntall: 'false',
    antall,
  };

  const attempts = [];
  if (roadReference) {
    attempts.push({
      fallbackPath: 'vegsystemreferanse',
      params: { ...baseParams, vegsystemreferanse: roadReference },
      cacheKey: `objects:${type}:ref:${roadReference}`,
    });
  }

  const searchBbox = bbox || (point ? pointToBbox({ ...point, radiusMeters }) : null);
  if (searchBbox) {
    attempts.push({
      fallbackPath: 'kartutsnitt',
      params: { ...baseParams, kartutsnitt: searchBbox },
      cacheKey: `objects:${type}:bbox:${searchBbox}`,
    });
    attempts.push({
      fallbackPath: 'polygon',
      params: { ...baseParams, polygon: bboxToPolygon(searchBbox) },
      cacheKey: `objects:${type}:polygon:${searchBbox}`,
    });
  }

  let lastError = null;
  let lastEmptyResult = null;
  for (const attempt of attempts) {
    try {
      const objects = await getNvdbObjectsByParams({ type, ...attempt });
      logNvdb('objects_attempt_completed', { type, fallbackPath: attempt.fallbackPath, rawObjectCount: objects.length });
      if (objects.length > 0 || attempt === attempts[attempts.length - 1]) {
        return { objects, fallbackPath: attempt.fallbackPath };
      }
      lastEmptyResult = { objects, fallbackPath: attempt.fallbackPath };
    } catch (error) {
      lastError = error;
      logNvdb('objects_attempt_failed', { type, fallbackPath: attempt.fallbackPath, message: String(error?.message || '').slice(0, 240) });
    }
  }

  if (lastEmptyResult) return lastEmptyResult;
  if (lastError) throw lastError;
  return { objects: [], fallbackPath: 'none' };
}

function coordinateRange(features) {
  const coordinates = features.flatMap((feature) => allCoordinates(feature.geometry))
    .map((coord) => normalizeLonLatPair(coord?.[0], coord?.[1]))
    .filter(Boolean);
  if (!coordinates.length) return null;
  const lngValues = coordinates.map(([lng]) => lng);
  const latValues = coordinates.map(([, lat]) => lat);
  return {
    minLng: Math.min(...lngValues),
    maxLng: Math.max(...lngValues),
    minLat: Math.min(...latValues),
    maxLat: Math.max(...latValues),
    kristiansandLikely: lngValues.some((lng) => lng >= 7 && lng <= 9) && latValues.some((lat) => lat >= 57 && lat <= 59),
  };
}

export async function getNvdbLayerGeoJson({ type, bbox }) {
  const { objects, fallbackPath } = await getNvdbObjects({ type, bbox, antall: 250 });
  const bboxBounds = bbox ? bboxValues(bbox) : null;
  const features = objects.flatMap((object) => featuresForObject(object, type, bboxBounds));
  const pointFeatureCount = features.filter((feature) => feature.geometry?.type === 'Point').length;
  const invalidGeometryCount = Math.max(0, objects.length - (type === 'accidents' ? pointFeatureCount : features.length));
  const range = coordinateRange(features);
  logNvdb('layer_geojson_completed', {
    type,
    bbox,
    fallbackPath,
    rawObjectCount: objects.length,
    featureCount: features.length,
    pointFeatureCount,
    invalidGeometryCount,
    firstGeometry: features[0]?.geometry || null,
    coordinateRange: range,
  });
  return {
    type: 'FeatureCollection',
    features,
    meta: {
      type,
      bbox,
      fallbackPath,
      rawObjectCount: objects.length,
      featureCount: features.length,
      pointFeatureCount,
      invalidGeometryCount,
      firstGeometry: features[0]?.geometry || null,
      coordinateRange: range,
    },
  };
}

function positionDistance(position) {
  return position?.avstand
    ?? position?.avstand_meter
    ?? position?.avstandTilVegnett
    ?? position?.avstand_til_vegnett
    ?? position?.lokasjon?.avstand
    ?? null;
}

export async function getRoadPosition({ lat, lng }) {
  const configuredMax = positionMaxDistanceMeters();
  const distances = unique([100, Math.min(configuredMax, 300), configuredMax, 500].filter((value) => value > 0))
    .sort((a, b) => a - b);

  for (const distance of distances) {
    const matches = await nvdbGet('/vegnett/api/v4/posisjon', {
      lat,
      lon: lng,
      maks_avstand: distance,
      srid: 4326,
    }, `position:${lat.toFixed(6)}:${lng.toFixed(6)}:${distance}`);

    const match = Array.isArray(matches) ? matches[0] : null;
    logNvdb('position_summary', {
      lat,
      lng,
      maxDistanceM: distance,
      matches: Array.isArray(matches) ? matches.length : 0,
      hasMatch: Boolean(match),
      distanceM: positionDistance(match),
      roadReference: match?.vegsystemreferanse?.kortform || null,
    });

    if (match) {
      return {
        ...match,
        _nvdbMatchDistanceM: positionDistance(match),
        _nvdbMaxDistanceM: distance,
        _nvdbMatchNote: distance > 100 ? `Matched nearest road within ${distance}m` : null,
      };
    }
  }

  return null;
}

function allCoordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  if (geometry.type === 'MultiPoint') return geometry.coordinates;
  if (geometry.type === 'MultiLineString') return geometry.coordinates.flat();
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2);
  return [];
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

function distanceToObjectMeters(object, point) {
  const distances = allCoordinates(objectGeometry(object))
    .filter(isWgs84Coordinate)
    .map(([featureLng, featureLat]) => haversineMeters(point, { lat: featureLat, lng: featureLng }));
  return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

async function getNearestObjectValue({ type, lat, lng, roadReference }) {
  const point = { lat, lng };
  const refResult = roadReference
    ? await getNvdbObjects({ type, roadReference, point, radiusMeters: layerSearchRadiusMeters(), antall: 30 })
    : { objects: [], fallbackPath: 'no_reference' };
  const result = refResult.objects.length
    ? refResult
    : await getNvdbObjects({ type, point, radiusMeters: layerSearchRadiusMeters(), antall: 50 });

  const candidates = result.objects
    .map((object) => ({
      object,
      value: findPropertyValue(object, NVDB_LAYER_TYPES[type]?.propertyNames || []),
      distanceM: distanceToObjectMeters(object, point),
    }))
    .filter((candidate) => candidate.value !== null && candidate.value !== undefined)
    .sort((a, b) => a.distanceM - b.distanceM);

  const selected = candidates[0] || null;
  logNvdb('selected_object_value', {
    type,
    fallbackPath: result.fallbackPath,
    rawObjectCount: result.objects.length,
    valueCandidateCount: candidates.length,
    selectedObjectId: selected?.object?.id || null,
    selectedValue: selected?.value ?? null,
    selectedDistanceM: Number.isFinite(selected?.distanceM) ? Math.round(selected.distanceM) : null,
  });

  return selected?.value ?? null;
}

async function nearestCrossingDistance({ lat, lng }) {
  const point = { lat, lng };
  const { objects, fallbackPath } = await getNvdbObjects({
    type: 'gangfelt',
    point,
    radiusMeters: crossingSearchRadiusMeters(),
    antall: 100,
  });

  const distances = objects
    .map((object) => distanceToObjectMeters(object, point))
    .filter(Number.isFinite);
  const nearest = distances.length ? validDistanceWithin(Math.min(...distances), Math.max(crossingSearchRadiusMeters(), 1000)) : null;
  logNvdb('nearest_crossing_completed', { fallbackPath, rawObjectCount: objects.length, nearestDistanceM: nearest });
  return nearest;
}


function normalizeSeverity(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('drept') || text.includes('død') || text.includes('fatal')) return 'fatal';
  if (text.includes('meget alvor') || text.includes('alvor')) return 'serious';
  if (text.includes('lettere') || text.includes('lett') || text.includes('minor')) return 'minor';
  return 'unknown';
}

function accidentYear(object) {
  const value = findFlexiblePropertyValue(object, ['ulykkesdato', 'dato']);
  const match = String(value || '').match(/(19|20)\d{2}/);
  return match ? match[0] : null;
}

function accidentSeverity(object) {
  return normalizeSeverity(findFlexiblePropertyValue(object, [
    'alvorligste skadegrad',
    'alvorligsteskadegrad',
    'alvorlighetsgrad',
    'skadegrad',
  ]));
}

function validDistanceWithin(value, maxMeters) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= maxMeters ? Math.round(number) : null;
}

function summarizeAccidents({ objects, point, radiusMeters }) {
  const severityCounts = { fatal: 0, serious: 0, minor: 0, unknown: 0 };
  const yearCounts = {};
  const objectsWithDistance = objects
    .map((object) => ({ object, distance: distanceToObjectMeters(object, point) }))
    .filter(({ distance }) => Number.isFinite(distance) && distance <= radiusMeters);
  const distances = objectsWithDistance
    .map(({ distance }) => distance)
    .filter((distance) => distance <= radiusMeters * 2);

  objectsWithDistance.forEach(({ object }) => {
    severityCounts[accidentSeverity(object)] += 1;
    const year = accidentYear(object);
    if (year) yearCounts[year] = (yearCounts[year] || 0) + 1;
  });

  const nearest = distances.length ? validDistanceWithin(Math.min(...distances), radiusMeters * 2) : null;
  const count = objectsWithDistance.length;
  return {
    accident_count: count,
    accident_search_radius_m: radiusMeters,
    nearest_accident_distance_m: nearest,
    accident_summary: {
      source: 'NVDB',
      radius_m: radiusMeters,
      count,
      ...(nearest !== null ? { nearest_distance_m: nearest } : {}),
      ...(Object.values(severityCounts).some((value) => value > 0) ? { severity_counts: severityCounts } : {}),
      ...(Object.keys(yearCounts).length > 0 ? { year_counts: yearCounts } : {}),
      note: count > 0 ? 'Accident objects found within radius' : 'No accident objects found within radius',
    },
  };
}

export async function getAccidentSummary({ lat, lng, reportId = null, radiusMeters = accidentReportRadiusMeters() }) {
  const point = { lat, lng };
  logNvdb('accident_lookup_started', { reportId, lat, lng, radiusMeters, objectTypeId: accidentObjectTypeId() });
  const { objects, fallbackPath } = await getNvdbObjects({
    type: 'accidents',
    point,
    radiusMeters,
    antall: 100,
  });
  const summary = summarizeAccidents({ objects, point, radiusMeters });
  logNvdb('accident_lookup_completed', {
    reportId,
    fallbackPath,
    rawObjectCount: objects.length,
    parsedAccidentCount: summary.accident_count,
    nearestAccidentDistanceM: summary.nearest_accident_distance_m,
  });
  return summary;
}

export function inferRoadAuthority(category) {
  const c = String(category || '').toUpperCase();
  if (c === 'E' || c === 'R') return 'Statens vegvesen';
  if (c === 'F') return 'Fylkeskommune';
  if (c === 'K') return 'Kommune';
  if (c === 'P') return 'Privat';
  if (c === 'S') return 'Skogsbilveg';
  return null;
}

export function roadCategoryLabel(category) {
  const c = String(category || '').toUpperCase();
  if (c === 'E') return 'Europaveg';
  if (c === 'R') return 'Riksveg';
  if (c === 'F') return 'Fylkesveg';
  if (c === 'K') return 'Kommunal veg';
  if (c === 'P') return 'Privat veg';
  if (c === 'S') return 'Skogsbilveg';
  return category || null;
}

function roadDataFromPosition(position) {
  const reference = position?.vegsystemreferanse;
  const system = reference?.vegsystem || {};
  const managers = position?.vegforvaltere || position?.lokasjon?.vegforvaltere || [];
  const manager = Array.isArray(managers) ? managers[0] : null;
  const roadCategory = system.vegkategori || null;
  const inferredAuthority = inferRoadAuthority(roadCategory);
  const managerName = manager?.vegforvalter || manager?.navn || null;

  return {
    road_owner: managerName || inferredAuthority,
    road_authority: managerName || inferredAuthority,
    road_category: roadCategory,
    road_number: system.nummer ? String(system.nummer) : null,
    road_reference: reference?.kortform || null,
    nvdb_note: position?._nvdbMatchNote || null,
  };
}

export async function enrichPoint({ lat, lng, reportId = null }) {
  const position = await getRoadPosition({ lat, lng });
  if (!position) {
    try {
      return {
        ...(await getAccidentSummary({ lat, lng, reportId })),
        nvdb_note: 'Fant ingen vegreferanse i NVDB innenfor maks avstand.',
      };
    } catch (error) {
      return {
        nvdb_note: 'Fant ingen vegreferanse i NVDB innenfor maks avstand.',
        accident_lookup_note: `Ulykkesoppslag feilet: ${String(error?.message || error || '').slice(0, 180)}`,
      };
    }
  }

  const roadData = roadDataFromPosition(position);
  const [speedLimit, aadt, crossingDistance, accidentSummary] = await Promise.allSettled([
    getNearestObjectValue({ type: 'speed_limit', lat, lng, roadReference: roadData.road_reference }),
    getNearestObjectValue({ type: 'aadt', lat, lng, roadReference: roadData.road_reference }),
    nearestCrossingDistance({ lat, lng }),
    getAccidentSummary({ lat, lng, reportId }),
  ]);

  const result = {
    ...roadData,
    speed_limit: speedLimit.status === 'fulfilled' ? speedLimit.value : null,
    aadt: aadt.status === 'fulfilled' ? aadt.value : null,
    nearest_crossing_distance_m: crossingDistance.status === 'fulfilled' ? crossingDistance.value : null,
    ...(accidentSummary.status === 'fulfilled' ? accidentSummary.value : {
      accident_lookup_note: `Ulykkesoppslag feilet: ${String(accidentSummary.reason?.message || accidentSummary.reason || '').slice(0, 180)}`,
    }),
  };
  logNvdb('parsed_result_summary', {
    hasRoadReference: Boolean(result.road_reference),
    roadCategory: result.road_category,
    roadOwner: result.road_owner,
    hasSpeedLimit: result.speed_limit !== null && result.speed_limit !== undefined,
    hasAadt: result.aadt !== null && result.aadt !== undefined,
    hasNearestCrossingDistance: result.nearest_crossing_distance_m !== null && result.nearest_crossing_distance_m !== undefined,
    accidentCount: result.accident_count ?? null,
    nearestAccidentDistanceM: result.nearest_accident_distance_m ?? null,
    nvdbNote: result.nvdb_note || result.accident_lookup_note || null,
  });
  return result;
}
