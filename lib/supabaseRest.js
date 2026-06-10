const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPORTS_TABLE = 'reports';
const PUBLIC_GEOJSON_VIEW = 'report_public_geojson';

function logSupabase(event, details = {}) {
  console.log(JSON.stringify({ scope: 'supabase', event, ...details }));
}

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
    logSupabase('request_failed', { resource, status: response.status, body: text.slice(0, 600) });
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
      road_reference: row.road_reference,
      support_count: row.support_count || 0,
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
  const geojson = normalizeGeoJson(rows);

  try {
    const supportRows = await supabaseFetch(REPORTS_TABLE, '?select=id,support_count,road_reference', { method: 'GET' });
    const reportContextById = new Map((supportRows || []).map((row) => [String(row.id), {
      support_count: Number(row.support_count || 0),
      road_reference: row.road_reference || null,
    }]));
    geojson.features = geojson.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        support_count: reportContextById.get(String(feature.properties?.id))?.support_count ?? Number(feature.properties?.support_count || 0),
        road_reference: feature.properties?.road_reference || reportContextById.get(String(feature.properties?.id))?.road_reference || null,
      },
    }));
  } catch (error) {
    logSupabase('support_count_merge_failed', { message: String(error?.message || '').slice(0, 240) });
  }

  return geojson;
}

export async function getReportById(id) {
  if (!id) return null;
  const rows = await supabaseFetch(REPORTS_TABLE, `?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export function sanitizeReportForDebug(report) {
  if (!report) return null;
  const {
    contact_name: _contactName,
    contact_email: _contactEmail,
    contact_phone: _contactPhone,
    ...safeReport
  } = report;
  return safeReport;
}

export async function createReport(report) {
  const rows = await supabaseFetch(REPORTS_TABLE, '', {
    method: 'POST',
    body: JSON.stringify(report),
  });

  const created = Array.isArray(rows) ? rows[0] : rows;
  logSupabase('report_inserted', {
    reportId: created?.id,
    category: created?.category || report?.category,
    lat: created?.lat || report?.lat,
    lng: created?.lng || report?.lng,
  });
  return created;
}

export async function getPublicReportById(id) {
  const report = await getReportById(id);
  if (!report) return null;
  const {
    contact_name: _contactName,
    contact_email: _contactEmail,
    contact_phone: _contactPhone,
    ...safeReport
  } = report;
  return safeReport;
}

export async function incrementReportSupport(id) {
  const report = await getReportById(id);
  if (!report) throw new Error('Report not found');
  const nextSupportCount = Number(report.support_count || 0) + 1;
  const updated = await updateReport(id, { support_count: nextSupportCount });
  logSupabase('report_support_incremented', { reportId: id, support_count: updated?.support_count ?? nextSupportCount });
  return updated || { ...report, support_count: nextSupportCount };
}

export async function updateReport(id, patch) {
  if (!id) return null;

  const rows = await supabaseFetch(REPORTS_TABLE, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  const updated = Array.isArray(rows) ? rows[0] : rows;
  logSupabase('report_updated', {
    reportId: id,
    fields: Object.keys(patch || {}),
    nvdb_status: updated?.nvdb_status || patch?.nvdb_status,
    has_trello_card_id: Boolean(updated?.trello_card_id || patch?.trello_card_id),
    has_trello_list_id: Boolean(updated?.trello_list_id || patch?.trello_list_id),
  });
  return updated;
}
