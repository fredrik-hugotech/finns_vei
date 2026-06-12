import { REPORT_IMAGE_BUCKET } from './reportImages';
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

function storageEndpoint(path = '') {
  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1${path}`;
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
    trello_card_id: _trelloCardId,
    trello_list_id: _trelloListId,
    ai_internal_summary: _aiInternalSummary,
    ai_public_status_suggestion: _aiPublicStatusSuggestion,
    ai_priority_suggestion: _aiPrioritySuggestion,
    ai_next_action_suggestion: _aiNextActionSuggestion,
    ai_suggestion_updated_at: _aiSuggestionUpdatedAt,
    ai_suggestion_status: _aiSuggestionStatus,
    ai_suggestion_note: _aiSuggestionNote,
    public_status_source: _publicStatusSource,
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
    public_status_note: safeProperties.public_status_note ?? row?.public_status_note ?? null,
    public_status_updated_at: safeProperties.public_status_updated_at ?? row?.public_status_updated_at ?? null,
    image_urls: safeProperties.image_urls ?? row?.image_urls ?? [],
  };
  properties.image_urls_json = JSON.stringify(properties.image_urls || []);

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
    const supportRows = await supabaseFetch(REPORTS_TABLE, '?select=id,support_count,road_reference,image_urls,public_status_note,public_status_updated_at', { method: 'GET' });
    const reportContextById = new Map((supportRows || []).map((row) => [String(row.id), {
      support_count: Number(row.support_count || 0),
      road_reference: row.road_reference || null,
      image_urls: row.image_urls || [],
      public_status_note: row.public_status_note || null,
      public_status_updated_at: row.public_status_updated_at || null,
    }]));
    geojson.features = geojson.features.map((feature) => {
      const reportId = feature.id ?? feature.properties?.id ?? feature.properties?.report_id;
      const context = reportContextById.get(String(reportId));
      const merged = {
        ...feature,
        ...(reportId ? { id: reportId } : {}),
        properties: {
          ...feature.properties,
          ...(reportId ? { id: reportId, report_id: reportId } : {}),
          support_count: context?.support_count ?? Number(feature.properties?.support_count || 0),
          road_reference: feature.properties?.road_reference || context?.road_reference || null,
          public_status_note: feature.properties?.public_status_note || context?.public_status_note || null,
          public_status_updated_at: feature.properties?.public_status_updated_at || context?.public_status_updated_at || null,
          image_urls: feature.properties?.image_urls || context?.image_urls || [],
        },
      };
      merged.properties.image_urls_json = JSON.stringify(merged.properties.image_urls || []);
      return merged;
    });
  } catch (error) {
    logSupabase('support_count_merge_failed', { message: String(error?.message || '').slice(0, 240) });
  }

  try {
    const supportRows = await supabaseFetch('report_supports', '?select=report_id,note,category,created_at&order=created_at.asc', { method: 'GET' });
    const byReport = new Map();
    for (const row of supportRows || []) {
      const key = String(row.report_id);
      if (!byReport.has(key)) byReport.set(key, { voices: [], categories: [] });
      const entry = byReport.get(key);
      if (row.category) entry.categories.push(row.category);
      const note = typeof row.note === 'string' ? row.note.trim() : '';
      if (note) entry.voices.push({ note, category: row.category || null, created_at: row.created_at || null });
    }
    geojson.features = geojson.features.map((feature) => {
      const reportId = feature.id ?? feature.properties?.id ?? feature.properties?.report_id;
      const entry = byReport.get(String(reportId));
      const counts = {};
      const baseCategory = feature.properties?.category;
      if (baseCategory) counts[baseCategory] = (counts[baseCategory] || 0) + 1;
      (entry?.categories || []).forEach((category) => { counts[category] = (counts[category] || 0) + 1; });
      const facets = Object.entries(counts).map(([category, count]) => ({ category, count }));
      return {
        ...feature,
        properties: {
          ...feature.properties,
          facets_json: JSON.stringify(facets),
          voices_json: JSON.stringify(entry?.voices || []),
        },
      };
    });
  } catch (error) {
    logSupabase('voices_merge_failed', { message: String(error?.message || '').slice(0, 240) });
  }

  return geojson;
}


function encodeStoragePath(path = '') {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

export function publicStorageUrl(path, bucket = REPORT_IMAGE_BUCKET) {
  return storageEndpoint(`/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`);
}

export async function uploadReportImage({ path, buffer, contentType, bucket = REPORT_IMAGE_BUCKET }) {
  if (!path || !buffer) throw new Error('Missing image upload path or content');
  const response = await fetch(storageEndpoint(`/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`), {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': '3600',
      'x-upsert': 'false',
    },
    body: buffer,
  });

  if (!response.ok) {
    const text = await response.text();
    logSupabase('storage_upload_failed', { bucket, path, status: response.status, body: text.slice(0, 400) });
    const error = new Error(`Supabase storage upload failed (${response.status})`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  logSupabase('storage_upload_completed', { bucket, path, contentType });
  return { path, url: publicStorageUrl(path, bucket) };
}

export async function updateReportImages(id, imageUrls = []) {
  if (!id) return null;
  const rows = await supabaseFetch(REPORTS_TABLE, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ image_urls: imageUrls }),
  });
  const updated = Array.isArray(rows) ? rows[0] : rows;
  logSupabase('report_images_updated', { reportId: id, imageCount: Array.isArray(imageUrls) ? imageUrls.length : 0 });
  return updated;
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

export async function createReportSupport({ reportId, supportToken, ipHash = null, userAgentHash = null, note = null, category = null }) {
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

  const baseRow = {
    report_id: reportId,
    support_token: supportToken || null,
    ip_hash: ipHash,
    user_agent_hash: userAgentHash,
  };
  const supportRow = { ...baseRow };
  if (note) supportRow.note = note;
  if (category) supportRow.category = category;

  const insertRow = (row) => supabaseFetch('report_supports', '', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  const isDuplicate = (error, body) => error.status === 409 || (error.status === 400 && body.includes('23505'));

  let alreadySupported = false;
  try {
    logSupport('insert_started', { reportId, hasSupportToken: Boolean(supportToken), hasNote: Boolean(note), hasCategory: Boolean(category) });
    await insertRow(supportRow);
    logSupport('insert_completed', { reportId, duplicateDetected: false });
  } catch (error) {
    const body = String(error?.body || error?.message || '');
    const unknownColumn = body.includes('42703') || body.includes('PGRST204') || /column .* does not exist/i.test(body);
    if (isDuplicate(error, body)) {
      alreadySupported = true;
      logSupport('insert_duplicate', { reportId, duplicateDetected: true, status: error.status || null });
    } else if (unknownColumn && (supportRow.note || supportRow.category)) {
      // report_supports.note/category not migrated yet — keep the +1 without the voice.
      logSupport('insert_retry_minimal', { reportId });
      try {
        await insertRow(baseRow);
      } catch (retryError) {
        const retryBody = String(retryError?.body || retryError?.message || '');
        if (isDuplicate(retryError, retryBody)) {
          alreadySupported = true;
        } else {
          logSupport('insert_failed', { reportId, status: retryError?.status || null, message: retryBody.slice(0, 240) });
          throw supportError('Could not insert report support', 'supabase_insert_failed', retryError);
        }
      }
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



export async function updateReportByTrelloCardId(trelloCardId, patch = {}) {
  if (!trelloCardId) return null;
  const rows = await supabaseFetch(REPORTS_TABLE, `?trello_card_id=eq.${encodeURIComponent(trelloCardId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function setReportStatusFromTrello({ trelloCardId, status }) {
  return updateReportByTrelloCardId(trelloCardId, {
    status,
    status_updated_at: new Date().toISOString(),
  });
}

export async function setPublicStatusFromTrelloComment({ trelloCardId, publicStatusNote }) {
  return updateReportByTrelloCardId(trelloCardId, {
    public_status_note: publicStatusNote,
    public_status_updated_at: new Date().toISOString(),
    public_status_source: 'trello_comment',
  });
}

export async function updateReportAiSuggestions(id, suggestionPatch = {}) {
  return updateReport(id, {
    ...suggestionPatch,
    ai_suggestion_updated_at: new Date().toISOString(),
  });
}

export async function approveReportAiPublicStatus(id) {
  const report = await getReportById(id);
  if (!report?.ai_public_status_suggestion) {
    const error = new Error('No AI public status suggestion to approve');
    error.status = 400;
    error.code = 'missing_ai_public_status_suggestion';
    throw error;
  }
  return updateReport(id, {
    public_status_note: report.ai_public_status_suggestion,
    public_status_updated_at: new Date().toISOString(),
    public_status_source: 'ai_approved',
    ai_suggestion_status: 'approved',
    ai_suggestion_updated_at: new Date().toISOString(),
  });
}

export async function rejectReportAiSuggestion(id) {
  return updateReport(id, {
    ai_suggestion_status: 'rejected',
    ai_suggestion_updated_at: new Date().toISOString(),
  });
}

export function sanitizeReportForBackofficeAi(report) {
  if (!report) return null;
  return {
    id: report.id,
    status: report.status || null,
    public_status_note: report.public_status_note || null,
    public_status_updated_at: report.public_status_updated_at || null,
    public_status_source: report.public_status_source || null,
    ai_internal_summary: report.ai_internal_summary || null,
    ai_public_status_suggestion: report.ai_public_status_suggestion || null,
    ai_priority_suggestion: report.ai_priority_suggestion || null,
    ai_next_action_suggestion: report.ai_next_action_suggestion || null,
    ai_suggestion_status: report.ai_suggestion_status || 'none',
    ai_suggestion_updated_at: report.ai_suggestion_updated_at || null,
    ai_suggestion_note: report.ai_suggestion_note || null,
  };
}
