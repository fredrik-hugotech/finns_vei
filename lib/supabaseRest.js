const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPORTS_TABLE = 'reports';
const PUBLIC_GEOJSON_VIEW = 'report_public_geojson';

export function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function endpoint(resource, path = '') {
  return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${resource}${path}`;
}

async function supabaseFetch(resource, path = '', options = {}) {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured');
  }

  const response = await fetch(endpoint(resource, path), {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function stripPrivateProperties(properties = {}) {
  const {
    contact_name: _contactName,
    contact_email: _contactEmail,
    contact_phone: _contactPhone,
    name: _name,
    email: _email,
    phone: _phone,
    ...safeProperties
  } = properties;

  return safeProperties;
}

function rowToFeature(row) {
  if (row?.type === 'Feature' && row.geometry) {
    return { ...row, properties: stripPrivateProperties(row.properties || {}) };
  }

  if (row?.feature?.type === 'Feature') {
    return { ...row.feature, properties: stripPrivateProperties(row.feature.properties || {}) };
  }

  if (row?.geojson?.type === 'Feature') {
    return { ...row.geojson, properties: stripPrivateProperties(row.geojson.properties || {}) };
  }

  const lng = Number(row?.lng ?? row?.longitude);
  const lat = Number(row?.lat ?? row?.latitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: stripPrivateProperties({
      id: row.id,
      status: row.status,
      category: row.category,
      description: row.description,
      created_at: row.created_at,
    }),
  };
}

function normalizeGeoJson(payload) {
  if (payload?.type === 'FeatureCollection') {
    return {
      type: 'FeatureCollection',
      features: (payload.features || []).map(rowToFeature).filter(Boolean),
    };
  }

  const rows = Array.isArray(payload) ? payload : [payload];
  const collectionRow = rows.find((row) => row?.type === 'FeatureCollection' || row?.geojson?.type === 'FeatureCollection');
  if (collectionRow) {
    const collection = collectionRow.type === 'FeatureCollection' ? collectionRow : collectionRow.geojson;
    return normalizeGeoJson(collection);
  }

  return {
    type: 'FeatureCollection',
    features: rows.map(rowToFeature).filter(Boolean),
  };
}

export async function getPublicReportGeoJson() {
  const rows = await supabaseFetch(PUBLIC_GEOJSON_VIEW, '?select=*', { method: 'GET' });
  return normalizeGeoJson(rows);
}

export async function createReport(report) {
  const rows = await supabaseFetch(REPORTS_TABLE, '', {
    method: 'POST',
    body: JSON.stringify(report),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateReport(id, patch) {
  if (!id) return null;

  const rows = await supabaseFetch(REPORTS_TABLE, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}
