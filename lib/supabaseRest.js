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
    const error = new Error(`Supabase request failed (${response.status}): ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
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

function idFromRow(row, feature = null) {
  return row?.feature_id
    ?? row?.id
    ?? row?.report_id
    ?? feature?.id
    ?? feature?.properties?.id
    ?? feature?.properties?.report_id
    ?? feature?.properties?.reportId
    ?? feature?.properties?.uuid
    ?? null;
}

function normalizePublicReportFeature(feature, row = {}) {
  if (!feature?.geometry) return null;
  const reportId = idFromRow(row, feature);
  const safeProperties = stripPrivateProperties(feature.properties || {});
  const properties = {
    ...safeProperties,
    ...(reportId ? { id: reportId, report_id: reportId } : {}),
    support_count: Number(safeProperties.support_count ?? row?.support_count ?? 0),
    road_reference: safeProperties.road_reference ?? row?.road_reference ?? null,
  };

  return {
    ...feature,
    ...(reportId ? { id: reportId } : {}),
    properties,
  };
}

function rowToFeature(row) {
  if (row?.type === 'Feature' && row.geometry) {
    return normalizePublicReportFeature(row, row);
  }

  if (row?.feature?.type === 'Feature') {
    return normalizePublicReportFeature(row.feature, row);
  }

  if (row?.geojson?.type === 'Feature') {
    return normalizePublicReportFeature(row.geojson, row);
  }

  const lng = Number(row?.lng ?? row?.longitude);
  const lat = Number(row?.lat ?? row?.latitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return normalizePublicReportFeature({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      status: row.status,
      category: row.category,
      description: row.description,
      created_at: row.created_at,
    },
  }, row);
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
    geojson.features = geojson.features.map((feature) => {
      const reportId = feature.id ?? feature.properties?.id ?? feature.properties?.report_id;
      const context = reportContextById.get(String(reportId));
      return {
        ...feature,
        ...(reportId ? { id: reportId } : {}),
        properties: {
          ...feature.properties,
          ...(reportId ? { id: reportId, report_id: reportId } : {}),
          support_count: context?.support_count ?? Number(feature.properties?.support_count || 0),
          road_reference: feature.properties?.road_reference || context?.road_reference || null,
        },
      };
    });
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

function supportError(message, code, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  error.status = cause?.status;
  error.body = cause?.body;
  return error;
}

function logSupport(event, details = {}) {
  logSupabase(`report_support_${event}`, details);
}

export async function countReportSupports(reportId) {
  logSupport('count_started', { reportId });
  try {
    const rows = await supabaseFetch('report_supports', `?report_id=eq.${encodeURIComponent(reportId)}&select=id`, { method: 'GET' });
    const count = Array.isArray(rows) ? rows.length : 0;
    logSupport('count_completed', { reportId, count });
    return count;
  } catch (error) {
    logSupport('count_failed', { reportId, status: error?.status || null, message: String(error?.message || '').slice(0, 240) });
    throw supportError('Could not count report supports', 'supabase_count_failed', error);
  }
}

export async function createReportSupport({ reportId, supportToken, ipHash = null, userAgentHash = null }) {
  logSupport('report_lookup_started', { reportId });
  let report = null;
  try {
    report = await getReportById(reportId);
  } catch (error) {
    logSupport('report_lookup_failed', { reportId, status: error?.status || null, message: String(error?.message || '').slice(0, 240) });
    throw supportError('Could not read report', 'supabase_report_read_failed', error);
  }
  if (!report) {
    logSupport('report_missing', { reportId });
    throw supportError('Report not found', 'invalid_report_id');
  }

  const supportRow = {
    report_id: reportId,
    support_token: supportToken || null,
    ip_hash: ipHash,
    user_agent_hash: userAgentHash,
  };

  let alreadySupported = false;
  try {
    logSupport('insert_started', { reportId, hasSupportToken: Boolean(supportToken), hasIpHash: Boolean(ipHash), hasUserAgentHash: Boolean(userAgentHash) });
    await supabaseFetch('report_supports', '', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(supportRow),
    });
    logSupport('insert_completed', { reportId, duplicateDetected: false });
  } catch (error) {
    const body = String(error?.body || error?.message || '');
    if (error.status === 409 || error.status === 400 && body.includes('23505')) {
      alreadySupported = true;
      logSupport('insert_duplicate', { reportId, duplicateDetected: true, status: error.status || null });
    } else {
      logSupport('insert_failed', { reportId, status: error?.status || null, message: body.slice(0, 240) });
      throw supportError('Could not insert report support', 'supabase_insert_failed', error);
    }
  }

  const supportCount = await countReportSupports(reportId);
  let updated = null;
  try {
    logSupport('update_started', { reportId, support_count: supportCount });
    updated = await syncReportSupportCount(reportId, supportCount);
    logSupport('update_completed', { reportId, support_count: updated?.support_count ?? supportCount, alreadySupported });
  } catch (error) {
    logSupport('update_failed', { reportId, status: error?.status || null, message: String(error?.message || '').slice(0, 240) });
    throw supportError('Could not update report support count', 'supabase_update_failed', error);
  }

  return {
    alreadySupported,
    report: updated || { ...report, support_count: supportCount },
    support_count: Number(updated?.support_count ?? supportCount),
  };
}

export async function incrementReportSupport(id) {
  const result = await createReportSupport({ reportId: id, supportToken: null });
  return result.report;
}


export async function syncReportSupportCount(reportId, supportCount) {
  await supabaseFetch(REPORTS_TABLE, `?id=eq.${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ support_count: supportCount }),
  });
  logSupabase('report_support_count_updated', { reportId, support_count: supportCount });
  return { id: reportId, support_count: supportCount };
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
