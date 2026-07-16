import { REPORT_IMAGE_BUCKET } from './reportImages';
import { snapToGrid, GRID_METERS, clipAndSnapCells, clipPath } from './geoPrivacy';
import { classifyWeather } from './weather';
import { REPORT_STATUS } from './config';
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

// Exact row count via PostgREST's `Prefer: count=exact`, read from the
// `Content-Range` response header (e.g. "0-0/42" or "*/42") - a HEAD request
// so no rows are ever fetched or transferred just to be counted.
async function supabaseCount(resource, path = '') {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured');
  }

  const response = await fetch(endpoint(resource, path), {
    method: 'HEAD',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logSupabase('count_request_failed', { resource, status: response.status, body: text.slice(0, 600) });
    const error = new Error(`Supabase request failed (${response.status}): ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  const contentRange = response.headers.get('content-range') || '';
  const match = contentRange.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
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

// Union of the columns previously fetched via two separate `reports` queries
// (support/road/status context + trello_card_id for status-update lookups).
const REPORT_CONTEXT_SELECT = 'id,lat,lng,support_count,road_reference,image_urls,public_status_note,public_status_updated_at,speed_limit,road_owner,road_category,trello_card_id';

function settleFetch(promise) {
  return promise.then((data) => ({ data, error: null })).catch((error) => ({ data: null, error }));
}

// Splits `ids` into chunks so `in.(...)` filters built from them stay well
// under PostgREST/URL length limits, then fetches `resource` once per chunk
// (scoped via `${idColumn}=in.(...)`) and concatenates the results. Returns
// [] without making a request when `ids` is empty.
const IN_FILTER_CHUNK_SIZE = 150;

function chunkList(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchScopedByIds(resource, path, idColumn, ids) {
  const uniqueIds = Array.from(new Set((ids || [])
    .filter((id) => id !== null && id !== undefined && id !== '')
    .map((id) => String(id))));
  if (!uniqueIds.length) return [];
  const batches = await Promise.all(chunkList(uniqueIds, IN_FILTER_CHUNK_SIZE).map((chunk) => {
    const filter = chunk.map((id) => encodeURIComponent(id)).join(',');
    return supabaseFetch(resource, `${path}&${idColumn}=in.(${filter})`, { method: 'GET' });
  }));
  return batches.flat();
}

export async function getPublicReportGeoJson() {
  // The public features query and the reports-context query don't depend on
  // each other's results, so they run concurrently first. The
  // report_supports and report_status_updates queries are scoped to the
  // report ids / trello_card_ids that come out of those two results (rather
  // than fetching the entire tables), so they're fetched in a second
  // concurrent batch once those ids are known.
  const [rows, reportContextOutcome] = await Promise.all([
    supabaseFetch(PUBLIC_GEOJSON_VIEW, '?select=*', { method: 'GET' }),
    settleFetch(supabaseFetch(REPORTS_TABLE, `?select=${REPORT_CONTEXT_SELECT}`, { method: 'GET' })),
  ]);

  const geojson = normalizeGeoJson(rows);
  const reportIds = geojson.features
    .map((feature) => feature.id ?? feature.properties?.id ?? feature.properties?.report_id)
    .filter((id) => id !== null && id !== undefined);

  let cardByReport = new Map();
  let trelloCardIds = [];

  if (reportContextOutcome.error) {
    logSupabase('support_count_merge_failed', { message: String(reportContextOutcome.error?.message || '').slice(0, 240) });
  } else {
    const reportContextRows = reportContextOutcome.data;
    const reportContextById = new Map((reportContextRows || []).map((row) => [String(row.id), {
      lat: Number(row.lat),
      lng: Number(row.lng),
      support_count: Number(row.support_count || 0),
      road_reference: row.road_reference || null,
      image_urls: row.image_urls || [],
      public_status_note: row.public_status_note || null,
      public_status_updated_at: row.public_status_updated_at || null,
      speed_limit: row.speed_limit ?? null,
      road_owner: row.road_owner || null,
      road_category: row.road_category || null,
    }]));
    cardByReport = new Map((reportContextRows || []).map((row) => [String(row.id), row.trello_card_id || null]));
    trelloCardIds = (reportContextRows || []).map((row) => row.trello_card_id).filter(Boolean);

    geojson.features = geojson.features.map((feature) => {
      const reportId = feature.id ?? feature.properties?.id ?? feature.properties?.report_id;
      const context = reportContextById.get(String(reportId));
      // Plot every report at its OWN stored lat/lng (the coordinate the reporter
      // actually placed), overriding whatever geometry the view returns — this
      // is the source of truth and stops cases from "jumping" if the view's
      // geometry column ever diverges from the report's lat/lng.
      const authoritativeGeometry = context && Number.isFinite(context.lat) && Number.isFinite(context.lng)
        ? { type: 'Point', coordinates: [context.lng, context.lat] }
        : feature.geometry;
      const merged = {
        ...feature,
        geometry: authoritativeGeometry,
        ...(reportId ? { id: reportId } : {}),
        properties: {
          ...feature.properties,
          ...(reportId ? { id: reportId, report_id: reportId } : {}),
          support_count: context?.support_count ?? Number(feature.properties?.support_count || 0),
          road_reference: feature.properties?.road_reference || context?.road_reference || null,
          public_status_note: feature.properties?.public_status_note || context?.public_status_note || null,
          public_status_updated_at: feature.properties?.public_status_updated_at || context?.public_status_updated_at || null,
          image_urls: feature.properties?.image_urls || context?.image_urls || [],
          speed_limit: feature.properties?.speed_limit ?? context?.speed_limit ?? null,
          road_owner: feature.properties?.road_owner || context?.road_owner || null,
          road_category: feature.properties?.road_category || context?.road_category || null,
        },
      };
      merged.properties.image_urls_json = JSON.stringify(merged.properties.image_urls || []);
      return merged;
    });
  }

  // Scoped to the report ids / trello_card_ids resolved above instead of
  // fetching the entire report_supports / report_status_updates tables.
  const [reportSupportsOutcome, statusUpdatesOutcome] = await Promise.all([
    settleFetch(fetchScopedByIds('report_supports', '?select=report_id,note,category,created_at&order=created_at.asc', 'report_id', reportIds)),
    settleFetch(fetchScopedByIds('report_status_updates', '?select=trello_card_id,note,created_at,source&order=created_at.asc', 'trello_card_id', trelloCardIds)),
  ]);

  if (reportSupportsOutcome.error) {
    logSupabase('voices_merge_failed', { message: String(reportSupportsOutcome.error?.message || '').slice(0, 240) });
  } else {
    const supportRows = reportSupportsOutcome.data;
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
  }

  // The status-update merge needs trello_card_id from the reports context
  // query above, so it's still gated on that query having succeeded too.
  if (statusUpdatesOutcome.error || reportContextOutcome.error) {
    const failure = statusUpdatesOutcome.error || reportContextOutcome.error;
    logSupabase('status_updates_merge_failed', { message: String(failure?.message || '').slice(0, 240) });
  } else {
    const updateRows = statusUpdatesOutcome.data;
    const updatesByCard = new Map();
    for (const row of updateRows || []) {
      const note = typeof row.note === 'string' ? row.note.trim() : '';
      if (!row.trello_card_id || !note) continue;
      if (row.source === 'internal') continue; // internal notes are staff-only
      const key = String(row.trello_card_id);
      if (!updatesByCard.has(key)) updatesByCard.set(key, []);
      updatesByCard.get(key).push({ note, created_at: row.created_at || null, source: row.source || 'trello_comment' });
    }
    geojson.features = geojson.features.map((feature) => {
      const reportId = feature.id ?? feature.properties?.id ?? feature.properties?.report_id;
      const card = cardByReport.get(String(reportId));
      const updates = card ? (updatesByCard.get(String(card)) || []) : [];
      return { ...feature, properties: { ...feature.properties, updates_json: JSON.stringify(updates) } };
    });
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

// Lightweight per-report aggregation for the live popup refresh (voices, status
// updates and facets), so an open case shows fresh replies without a page reload.
export async function getReportThread(reportId) {
  if (!reportId) return null;
  const reports = await supabaseFetch(
    REPORTS_TABLE,
    `?id=eq.${encodeURIComponent(reportId)}&select=id,status,category,description,created_at,road_owner,road_authority,road_category,speed_limit,image_urls,support_count,public_status_note,public_status_updated_at,trello_card_id`,
    { method: 'GET' },
  );
  const report = Array.isArray(reports) ? reports[0] : reports;
  if (!report) return null;

  // The supports, status-updates and attachments lookups don't depend on
  // each other's results, so run them concurrently instead of sequentially
  // (same pattern as getPublicReportGeoJson above).
  const [supportsOutcome, statusUpdatesOutcome, attachmentsOutcome] = await Promise.all([
    settleFetch(supabaseFetch('report_supports', `?report_id=eq.${encodeURIComponent(reportId)}&select=note,category,created_at&order=created_at.asc`, { method: 'GET' })),
    report.trello_card_id
      ? settleFetch(supabaseFetch('report_status_updates', `?trello_card_id=eq.${encodeURIComponent(report.trello_card_id)}&select=note,created_at,source&order=created_at.asc`, { method: 'GET' }))
      : Promise.resolve({ data: [], error: null }),
    settleFetch(listCaseAttachments(reportId, { publicOnly: true })),
  ]);

  const counts = {};
  if (report.category) counts[report.category] = 1;
  const voices = [];
  if (supportsOutcome.error) {
    logSupabase('thread_supports_failed', { reportId, message: String(supportsOutcome.error?.message || '').slice(0, 200) });
  } else {
    for (const row of supportsOutcome.data || []) {
      if (row.category) counts[row.category] = (counts[row.category] || 0) + 1;
      const note = typeof row.note === 'string' ? row.note.trim() : '';
      if (note) voices.push({ note, category: row.category || null, created_at: row.created_at || null });
    }
  }

  let updates = [];
  if (statusUpdatesOutcome.error) {
    logSupabase('thread_updates_failed', { reportId, message: String(statusUpdatesOutcome.error?.message || '').slice(0, 200) });
  } else {
    updates = (statusUpdatesOutcome.data || [])
      .filter((row) => row.source !== 'internal') // internal notes are staff-only
      .map((row) => ({ note: typeof row.note === 'string' ? row.note.trim() : '', created_at: row.created_at || null, source: row.source || 'trello_comment' }))
      .filter((update) => update.note);
  }

  const attachments = attachmentsOutcome.error
    ? []
    : (attachmentsOutcome.data || []).map((a) => ({ url: a.url, content_type: a.content_type || null }));

  return {
    id: report.id,
    status: report.status || null,
    category: report.category || 'Melding',
    description: report.description || null,
    created_at: report.created_at || null,
    road_owner: report.road_owner || null,
    road_authority: report.road_authority || null,
    road_category: report.road_category || null,
    speed_limit: report.speed_limit ?? null,
    image_urls: report.image_urls || [],
    attachments,
    support_count: Number(report.support_count || 0),
    public_status_note: report.public_status_note || null,
    public_status_updated_at: report.public_status_updated_at || null,
    facets: Object.entries(counts).map(([category, count]) => ({ category, count })),
    voices,
    updates,
  };
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

// Reports created since a timestamp — used by the daily email summary. Includes
// contact fields so staff can follow up on adult reports.
// `limit` is a defensive cap, not pagination — same idea as getCompetitionStats'
// TRIPS_LIMIT: an unusually heavy day of reports shouldn't be able to grow the
// resulting digest email unbounded. lib/dailySummaryEmail.js applies its own
// tighter display cap (~40 cards) on top of this.
const REPORTS_SINCE_LIMIT = 500;
export async function getReportsSince(sinceIso) {
  const cols = 'id,category,description,reporter_type,lat,lng,status,created_at,contact_name,contact_email,contact_phone';
  const rows = await supabaseFetch(
    REPORTS_TABLE,
    `?select=${cols}&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=${REPORTS_SINCE_LIMIT}`,
    { method: 'GET' },
  );
  return Array.isArray(rows) ? rows : [];
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

// Batch lookup for "Mine meldinger": current status/category for a set of
// report ids in one request. Only non-sensitive columns are selected, so no
// contact-field stripping is needed (unlike getPublicReportById).
export async function getPublicReportsByIds(ids) {
  const cleanIds = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id.trim()) : [];
  if (!cleanIds.length) return [];
  const filter = cleanIds.map((id) => encodeURIComponent(id.trim())).join(',');
  const rows = await supabaseFetch(REPORTS_TABLE, `?id=in.(${filter})&select=id,status,category`, { method: 'GET' });
  return Array.isArray(rows) ? rows : [];
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
    const count = await supabaseCount('report_supports', `?report_id=eq.${encodeURIComponent(reportId)}&select=id`);
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

// Permanently delete a report. report_supports has an ON DELETE CASCADE FK, so
// its rows go with it. report_status_updates is keyed by trello_card_id (shared
// across grouped reports), so it is deliberately left intact. The Trello card
// is external and is not touched.
export async function deleteReport(id) {
  if (!id) return;
  await supabaseFetch(REPORTS_TABLE, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  logSupabase('report_deleted', { reportId: id });
}

// ---------------------------------------------------------------------------
// Staff accounts (email + password login for superusers/staff)
// ---------------------------------------------------------------------------
const STAFF_TABLE = 'staff';
const STAFF_SESSIONS_TABLE = 'staff_sessions';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function countStaff() {
  return supabaseCount(STAFF_TABLE, '?select=id');
}

export async function getStaffByEmail(email) {
  const rows = await supabaseFetch(STAFF_TABLE, `?select=*&email=eq.${encodeURIComponent(normalizeEmail(email))}&limit=1`, { method: 'GET' });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function getStaffById(id) {
  const rows = await supabaseFetch(STAFF_TABLE, `?select=id,email,name,role,active&id=eq.${encodeURIComponent(id)}&limit=1`, { method: 'GET' });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function listStaff() {
  const rows = await supabaseFetch(STAFF_TABLE, '?select=id,email,name,role,active,created_at&order=created_at.asc', { method: 'GET' });
  return Array.isArray(rows) ? rows : [];
}

export async function createStaff({ email, name = null, role = 'staff', passwordHash }) {
  const row = { email: normalizeEmail(email), name: name || null, role: role === 'superuser' ? 'superuser' : 'staff', password_hash: passwordHash, active: true };
  const rows = await supabaseFetch(STAFF_TABLE, '', { method: 'POST', body: JSON.stringify(row) });
  const created = Array.isArray(rows) ? rows[0] : rows;
  logSupabase('staff_created', { email: row.email, role: row.role });
  return created || null;
}

export async function setStaffActive(id, active) {
  await supabaseFetch(STAFF_TABLE, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: Boolean(active) }),
  });
}

export async function setStaffPassword(id, passwordHash) {
  await supabaseFetch(STAFF_TABLE, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ password_hash: passwordHash }),
  });
}

export async function createStaffSession(token, staffId, expiresAt) {
  await supabaseFetch(STAFF_SESSIONS_TABLE, '', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ token, staff_id: staffId, expires_at: expiresAt }),
  });
}

export async function getStaffSession(token) {
  const rows = await supabaseFetch(STAFF_SESSIONS_TABLE, `?select=staff_id,expires_at&token=eq.${encodeURIComponent(token)}&limit=1`, { method: 'GET' });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function deleteStaffSession(token) {
  await supabaseFetch(STAFF_SESSIONS_TABLE, `?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

// ---------------------------------------------------------------------------
// Case attachments (files staff add to a case; internal or public)
// ---------------------------------------------------------------------------
const CASE_ATTACHMENTS_TABLE = 'case_attachments';

export async function createCaseAttachment({ reportId, url, path, contentType, filename, visibility = 'internal', size = null }) {
  const row = {
    report_id: reportId,
    url,
    path: path || null,
    content_type: contentType || null,
    filename: filename || null,
    visibility: visibility === 'public' ? 'public' : 'internal',
    size,
  };
  const rows = await supabaseFetch(CASE_ATTACHMENTS_TABLE, '', { method: 'POST', body: JSON.stringify(row) });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function listCaseAttachments(reportId, { publicOnly = false } = {}) {
  const filter = publicOnly ? '&visibility=eq.public' : '';
  try {
    const rows = await supabaseFetch(CASE_ATTACHMENTS_TABLE, `?report_id=eq.${encodeURIComponent(reportId)}${filter}&select=id,url,filename,content_type,visibility,created_at&order=created_at.asc`, { method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  } catch (_e) {
    return [];
  }
}

export async function getCaseAttachment(id) {
  const rows = await supabaseFetch(CASE_ATTACHMENTS_TABLE, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { method: 'GET' });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function deleteCaseAttachment(id) {
  await supabaseFetch(CASE_ATTACHMENTS_TABLE, `?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

export async function setCaseAttachmentVisibility(id, visibility) {
  await supabaseFetch(CASE_ATTACHMENTS_TABLE, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ visibility: visibility === 'public' ? 'public' : 'internal' }),
  });
}

// Internal: list recent reports for the staff dashboard (includes Trello id).
export async function listReportsForBackoffice({ limit = 300 } = {}) {
  const select = 'id,category,status,description,lat,lng,created_at,status_updated_at,trello_card_id,public_status_note,bike_route_type,road_owner,speed_limit,due_date,assignee_email,support_count';
  const rows = await supabaseFetch(
    REPORTS_TABLE,
    `?select=${select}&order=created_at.desc&limit=${limit}`,
    { method: 'GET' },
  );
  return Array.isArray(rows) ? rows : [];
}

// Citizen support for a single case: the denormalized count plus every written
// "voice" (a supporter's note + category). Used by the case workspace so staff
// see what residents actually said, not just a number.
export async function getCaseSupport(reportId) {
  if (!reportId) return { support_count: 0, voices: [], facets: [] };
  const counts = {};
  const voices = [];
  try {
    const rows = await supabaseFetch(
      'report_supports',
      `?report_id=eq.${encodeURIComponent(reportId)}&select=note,category,created_at&order=created_at.desc`,
      { method: 'GET' },
    );
    for (const row of rows || []) {
      if (row.category) counts[row.category] = (counts[row.category] || 0) + 1;
      const note = typeof row.note === 'string' ? row.note.trim() : '';
      if (note) voices.push({ note, category: row.category || null, created_at: row.created_at || null });
    }
  } catch (error) {
    logSupabase('case_support_failed', { reportId, message: String(error?.message || '').slice(0, 200) });
  }
  return {
    voices,
    facets: Object.entries(counts).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
  };
}

// Best-effort: set case_id without failing if the column is not migrated yet.
export async function setReportCaseId(id, caseId) {
  if (!id || !caseId) return;
  try {
    await supabaseFetch(REPORTS_TABLE, `?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ case_id: caseId }),
    });
  } catch (error) {
    logSupabase('set_case_id_failed', { reportId: id, message: String(error?.message || '').slice(0, 200) });
  }
}

export async function countReportsByTrelloCard(trelloCardId) {
  if (!trelloCardId) return 0;
  try {
    const rows = await supabaseFetch(REPORTS_TABLE, `?trello_card_id=eq.${encodeURIComponent(trelloCardId)}&select=id`, { method: 'GET' });
    return Array.isArray(rows) ? rows.length : 0;
  } catch (error) {
    return 0;
  }
}

// Find open reports that already anchor a Trello card within a small box around a point.
export async function findNearbyOpenCases({ lat, lng, radiusM = 35 }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const params = [
    'select=id,trello_card_id,trello_list_id,status,lat,lng,road_reference,category',
    'trello_card_id=not.is.null',
    `status=neq.${encodeURIComponent(REPORT_STATUS.DONE)}`,
    `lat=gte.${(lat - dLat).toFixed(6)}`,
    `lat=lte.${(lat + dLat).toFixed(6)}`,
    `lng=gte.${(lng - dLng).toFixed(6)}`,
    `lng=lte.${(lng + dLng).toFixed(6)}`,
    'limit=50',
  ].join('&');
  const rows = await supabaseFetch(REPORTS_TABLE, `?${params}`, { method: 'GET' });
  return Array.isArray(rows) ? rows : [];
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

// Append a public status update for a case (keyed by the shared Trello card) so the
// public popup can show every Finns Fairway reply as its own message. Best-effort:
// duplicates (same Trello action) and a missing table are swallowed.
// Full case timeline for staff: every note incl. internal ones. Admin-only.
export async function getCaseTimeline(trelloCardId) {
  if (!trelloCardId) return [];
  try {
    const rows = await supabaseFetch('report_status_updates', `?trello_card_id=eq.${encodeURIComponent(trelloCardId)}&select=note,created_at,source&order=created_at.asc`, { method: 'GET' });
    return (rows || [])
      .map((row) => ({ note: typeof row.note === 'string' ? row.note.trim() : '', created_at: row.created_at || null, source: row.source || 'trello_comment' }))
      .filter((u) => u.note);
  } catch (_e) {
    return [];
  }
}

export async function addCaseStatusUpdate({ trelloCardId, note, source = 'trello_comment', trelloActionId = null }) {
  if (!trelloCardId || !note) return;
  const row = { trello_card_id: trelloCardId, note, source };
  if (trelloActionId) row.trello_action_id = trelloActionId;
  try {
    await supabaseFetch('report_status_updates', '', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    logSupabase('case_status_update_added', { trelloCardId });
  } catch (error) {
    logSupabase('case_status_update_skipped', { trelloCardId, status: error?.status || null, message: String(error?.body || error?.message || '').slice(0, 200) });
  }
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

// ---------------------------------------------------------------------------
// Children's cycling competitions
//
// Two tables: `competitions` (defined by the municipality in the backoffice)
// and `bike_trips` (logged by participants). A trip's origin is snapped to a
// coarse grid before it ever reaches the database — see lib/geoPrivacy.js — so
// no exact home location is stored. No names are collected.
// ---------------------------------------------------------------------------

const COMPETITIONS_TABLE = 'competitions';
const BIKE_TRIPS_TABLE = 'bike_trips';

function normalizeClubs(clubs) {
  if (!Array.isArray(clubs)) return [];
  return clubs
    .map((club) => {
      if (!club) return null;
      const name = String(club.name || '').trim();
      if (!name) return null;
      const lat = Number(club.lat);
      const lng = Number(club.lng);
      const entry = { name };
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        entry.lat = Number(lat.toFixed(6));
        entry.lng = Number(lng.toFixed(6));
      }
      return entry;
    })
    .filter(Boolean);
}

function normalizeMetric(value) {
  return value === 'distance' ? 'distance' : 'trips';
}

function rowToCompetition(row = {}) {
  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    clubs: Array.isArray(row.clubs) ? row.clubs : [],
    starts_on: row.starts_on || null,
    ends_on: row.ends_on || null,
    helmet_focus: Boolean(row.helmet_focus),
    metric: normalizeMetric(row.metric),
    active: row.active !== false,
    created_at: row.created_at || null,
  };
}

export async function listCompetitions({ activeOnly = false } = {}) {
  const filter = activeOnly ? '&active=eq.true' : '';
  const rows = await supabaseFetch(
    COMPETITIONS_TABLE,
    `?select=*${filter}&order=created_at.desc`,
    { method: 'GET' },
  );
  return Array.isArray(rows) ? rows.map(rowToCompetition) : [];
}

export async function getCompetition(id) {
  const rows = await supabaseFetch(
    COMPETITIONS_TABLE,
    `?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    { method: 'GET' },
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? rowToCompetition(row) : null;
}

export async function createCompetition(input = {}) {
  const row = {
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim() || null,
    clubs: normalizeClubs(input.clubs),
    starts_on: input.starts_on || null,
    ends_on: input.ends_on || null,
    helmet_focus: Boolean(input.helmet_focus),
    metric: normalizeMetric(input.metric),
    active: input.active !== false,
  };
  const rows = await supabaseFetch(COMPETITIONS_TABLE, '', {
    method: 'POST',
    body: JSON.stringify(row),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  logSupabase('competition_created', { competitionId: created?.id, name: row.name });
  return created ? rowToCompetition(created) : null;
}

export async function updateCompetition(id, patch = {}) {
  const row = {};
  if (patch.name !== undefined) row.name = String(patch.name).trim();
  if (patch.description !== undefined) row.description = String(patch.description).trim() || null;
  if (patch.clubs !== undefined) row.clubs = normalizeClubs(patch.clubs);
  if (patch.starts_on !== undefined) row.starts_on = patch.starts_on || null;
  if (patch.ends_on !== undefined) row.ends_on = patch.ends_on || null;
  if (patch.helmet_focus !== undefined) row.helmet_focus = Boolean(patch.helmet_focus);
  if (patch.metric !== undefined) row.metric = normalizeMetric(patch.metric);
  if (patch.active !== undefined) row.active = Boolean(patch.active);

  const rows = await supabaseFetch(
    COMPETITIONS_TABLE,
    `?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(row) },
  );
  const updated = Array.isArray(rows) ? rows[0] : rows;
  return updated ? rowToCompetition(updated) : null;
}

export async function createBikeTrip({ competitionId, club, helmet, distanceM = null, durationS = null, cells = [], path = [], routeType = null, mode = null, weather = null, tripToken = null } = {}) {
  // `cells`/`path` are supposed to already be clipped (home zone removed) and
  // snapped on the device — see lib/geoPrivacy.js. Never trust that: a client
  // could skip the on-device clip, or POST straight to /api/bike-trips with a
  // raw trace. Re-run the exact same start-clip here using the actual
  // geoPrivacy helpers, so the ~50m home-privacy guarantee holds even for a
  // hostile client. The incoming path's own first point is treated as the
  // "home" reference for both the path and the (otherwise unordered) cells.
  const rawPathPoints = [];
  if (Array.isArray(path)) {
    for (const point of path) {
      const lng = Array.isArray(point) ? Number(point[0]) : Number(point?.lng);
      const lat = Array.isArray(point) ? Number(point[1]) : Number(point?.lat);
      if (Number.isFinite(lng) && Number.isFinite(lat)) rawPathPoints.push({ lat, lng });
    }
  }
  const rawCellPoints = [];
  if (Array.isArray(cells)) {
    for (const cell of cells) {
      const lng = Array.isArray(cell) ? Number(cell[0]) : Number(cell?.lng);
      const lat = Array.isArray(cell) ? Number(cell[1]) : Number(cell?.lat);
      if (Number.isFinite(lng) && Number.isFinite(lat)) rawCellPoints.push({ lat, lng });
    }
  }
  const homeRef = rawPathPoints[0] || rawCellPoints[0] || null;

  const cleanPath = clipPath(rawPathPoints);
  const snappedCells = new Map();
  if (homeRef) {
    for (const [lng, lat] of clipAndSnapCells([homeRef, ...rawCellPoints], { gridMeters: GRID_METERS })) {
      snappedCells.set(`${lng},${lat}`, [lng, lat]);
    }
  }

  const w = weather && typeof weather === 'object' ? weather : null;
  const weatherSymbol = w?.symbol || null;
  const precipMm = Number.isFinite(Number(w?.precipMm)) ? Number(w.precipMm) : null;
  // Never trust the client's own `weather.bonus` flag directly - it's a
  // competitive advantage (the "Værhelt" badge/tiebreaker), so recompute it
  // server-side from the symbol/precip values actually being stored, using
  // the same classification the API route and UI already agree on.
  const { isPrecip: weatherBonus } = classifyWeather(weatherSymbol || '', precipMm || 0);
  const row = {
    competition_id: competitionId,
    club: String(club || '').trim() || null,
    helmet: Boolean(helmet),
    distance_m: Number.isFinite(Number(distanceM)) ? Math.round(Number(distanceM)) : null,
    duration_s: Number.isFinite(Number(durationS)) ? Math.round(Number(durationS)) : null,
    path_cells: Array.from(snappedCells.values()),
    path: cleanPath,
    route_type: routeType === 'skole' ? 'skole' : (routeType === 'fritid' ? 'fritid' : null),
    mode: mode === 'gange' ? 'gange' : 'sykkel',
    weather_symbol: weatherSymbol,
    precip_mm: precipMm,
    temp_c: Number.isFinite(Number(w?.tempC)) ? Number(w.tempC) : null,
    weather_bonus: weatherBonus,
    trip_token: tripToken || null,
  };

  let rows;
  try {
    rows = await supabaseFetch(BIKE_TRIPS_TABLE, '', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (_e) {
    // `mode`/weather/`path`/`route_type` columns may not be migrated yet —
    // persist the trip without the optional columns rather than losing the
    // ride entirely.
    const { mode: _m, weather_symbol: _ws, precip_mm: _p, temp_c: _t, weather_bonus: _wb, path: _path, route_type: _rt, ...rest } = row;
    rows = await supabaseFetch(BIKE_TRIPS_TABLE, '', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rest),
    });
  }
  logSupabase('bike_trip_logged', { competitionId, club: row.club, helmet: row.helmet, distanceM: row.distance_m, mode: row.mode, weatherBonus: row.weather_bonus, pathPoints: cleanPath.length });
  return Array.isArray(rows) ? rows[0] : rows;
}

const CLUB_COLORS = ['#0b5d4d', '#e8590c', '#1d4ed8', '#7c3aed', '#c2185b', '#15803d', '#b45309', '#0e7490'];

// Aggregate everything a public competition view needs: per-club leaderboard
// (trips, distance, helmet share) and Strava-style route lines (one per trip,
// coloured by club, with home/destination ends already clipped off).
export async function getCompetitionStats(id, { mode = null } = {}) {
  const competition = await getCompetition(id);
  if (!competition) return null;

  // Select `mode` too, but fall back gracefully if the column has not been
  // migrated yet (older trips predate walk/bike and count as 'sykkel').
  // `limit` is a defensive cap, not pagination - a long-running/popular
  // competition shouldn't be able to grow this (and its client-side
  // segment-density aggregation) unbounded.
  const TRIPS_LIMIT = 5000;
  let trips;
  try {
    trips = await supabaseFetch(
      BIKE_TRIPS_TABLE,
      `?select=club,helmet,distance_m,duration_s,path,mode,weather_bonus&competition_id=eq.${encodeURIComponent(id)}&limit=${TRIPS_LIMIT}`,
      { method: 'GET' },
    );
  } catch (_e) {
    trips = await supabaseFetch(
      BIKE_TRIPS_TABLE,
      `?select=club,helmet,distance_m,duration_s,path&competition_id=eq.${encodeURIComponent(id)}&limit=${TRIPS_LIMIT}`,
      { method: 'GET' },
    );
  }
  const allRows = Array.isArray(trips) ? trips : [];
  // Count per mode (for a picker), then optionally filter to one mode.
  const modeCounts = { sykkel: 0, gange: 0 };
  for (const t of allRows) modeCounts[(t.mode === 'gange' ? 'gange' : 'sykkel')] += 1;
  const wantMode = mode === 'sykkel' || mode === 'gange' ? mode : null;
  const rows = wantMode ? allRows.filter((t) => (t.mode === 'gange' ? 'gange' : 'sykkel') === wantMode) : allRows;

  const clubColor = new Map();
  competition.clubs.forEach((club, index) => {
    if (club?.name) clubColor.set(club.name, CLUB_COLORS[index % CLUB_COLORS.length]);
  });
  const colorFor = (name) => {
    if (clubColor.has(name)) return clubColor.get(name);
    const color = CLUB_COLORS[clubColor.size % CLUB_COLORS.length];
    clubColor.set(name, color);
    return color;
  };

  const byClub = new Map();
  for (const club of competition.clubs) {
    if (club?.name) byClub.set(club.name, { club: club.name, trips: 0, helmetTrips: 0, distanceM: 0, bonusTrips: 0 });
  }
  for (const trip of rows) {
    const name = trip.club || 'Ukjent';
    if (!byClub.has(name)) byClub.set(name, { club: name, trips: 0, helmetTrips: 0, distanceM: 0, bonusTrips: 0 });
    const entry = byClub.get(name);
    entry.trips += 1;
    if (trip.helmet) entry.helmetTrips += 1;
    if (trip.weather_bonus) entry.bonusTrips += 1;
    if (Number.isFinite(Number(trip.distance_m))) entry.distanceM += Number(trip.distance_m);
  }

  const metric = competition.metric === 'distance' ? 'distance' : 'trips';
  const leaderboard = Array.from(byClub.values())
    .map((entry) => ({
      ...entry,
      color: colorFor(entry.club),
      helmetPct: entry.trips ? Math.round((entry.helmetTrips / entry.trips) * 100) : 0,
    }))
    .sort((a, b) => {
      // Rank by the real metric — living somewhere with nice weather is never
      // a disadvantage.
      if (metric === 'distance') { if (b.distanceM !== a.distanceM) return b.distanceM - a.distanceM; }
      else if (b.trips !== a.trips) return b.trips - a.trips;
      // Weather only breaks ties: most rides in rain/snow wins a close race.
      if (b.bonusTrips !== a.bonusTrips) return b.bonusTrips - a.bonusTrips;
      return a.club.localeCompare(b.club);
    });

  // "Værhelt": the club that has ridden most in rain or snow — a badge of
  // honour, not extra points.
  const heroEntry = Array.from(byClub.values())
    .filter((e) => e.bonusTrips > 0)
    .sort((a, b) => b.bonusTrips - a.bonusTrips)[0];
  const weatherHero = heroEntry ? { club: heroEntry.club, bonusTrips: heroEntry.bonusTrips } : null;

  // Per-segment density: snap each consecutive pair of a route to a ~25 m grid
  // and count how many trips use that exact segment. Shared roads merge into one
  // line whose weight = number of registrations → we draw it brighter/stronger.
  const SEG_GRID = 25;
  const keyOf = (cell) => `${cell[0]},${cell[1]}`;
  const segments = new Map();
  for (const trip of rows) {
    const path = Array.isArray(trip.path) ? trip.path : [];
    if (path.length < 2) continue;
    const seen = new Set(); // count each trip at most once per segment
    let prev = null;
    for (const point of path) {
      const lng = Array.isArray(point) ? Number(point[0]) : Number(point?.lng);
      const lat = Array.isArray(point) ? Number(point[1]) : Number(point?.lat);
      const snapped = snapToGrid(lat, lng, SEG_GRID);
      if (!snapped) continue;
      const cur = [snapped.lng, snapped.lat];
      if (!prev) { prev = cur; continue; }
      if (prev[0] === cur[0] && prev[1] === cur[1]) continue; // same cell, wait for movement
      const segKey = [keyOf(prev), keyOf(cur)].sort().join('|');
      if (!seen.has(segKey)) {
        seen.add(segKey);
        const existing = segments.get(segKey);
        if (existing) existing.weight += 1;
        else segments.set(segKey, { a: prev, b: cur, weight: 1 });
      }
      prev = cur;
    }
  }
  const features = Array.from(segments.values()).map((seg) => ({
    type: 'Feature',
    properties: { weight: seg.weight },
    geometry: { type: 'LineString', coordinates: [seg.a, seg.b] },
  }));

  const totalDistanceM = rows.reduce((sum, trip) => sum + (Number.isFinite(Number(trip.distance_m)) ? Number(trip.distance_m) : 0), 0);

  return {
    competition,
    metric,
    totals: {
      trips: rows.length,
      helmetTrips: rows.filter((t) => t.helmet).length,
      distanceM: totalDistanceM,
      weatherBonusTrips: rows.filter((t) => t.weather_bonus).length,
    },
    modeCounts,
    mode: wantMode || 'samlet',
    weatherHero,
    leaderboard,
    geojson: { type: 'FeatureCollection', features },
  };
}

// ---------------------------------------------------------------------------
// "Hotteste saker" (staff triage view): open cases ranked by a heat score
// combining citizen support_count with concern/facet diversity, instead of
// relying purely on Trello column order.
// ---------------------------------------------------------------------------
const HOT_CASE_SELECT = 'id,category,status,description,lat,lng,created_at,status_updated_at,road_owner,speed_limit,support_count,due_date,assignee_email,trello_card_id,case_id';

// Heat is a first heuristic, not a scientific model: each citizen support
// counts once, and each *distinct* concern category present on the case
// (base report category + any voiced categories from report_supports) adds a
// bonus, since a case worrying people for several different reasons (e.g.
// both "høy fart" and "dårlig sikt") is arguably hotter than the same
// support_count spread across one repeated concern. Voices (free-text notes)
// add a small extra nudge because they represent someone who cared enough to
// write something, not just tap "+1".
function computeHeat({ supportCount, distinctFacetCount, voiceCount }) {
  const support = Number(supportCount || 0);
  const diversityBonus = Math.max(0, Number(distinctFacetCount || 0) - 1) * 2;
  const voiceBonus = Number(voiceCount || 0) * 0.5;
  return support + diversityBonus + voiceBonus;
}

export async function listHotCases({ limit = 300 } = {}) {
  const rows = await supabaseFetch(
    REPORTS_TABLE,
    `?select=${HOT_CASE_SELECT}&status=neq.${encodeURIComponent(REPORT_STATUS.DONE)}&order=support_count.desc&limit=${limit}`,
    { method: 'GET' },
  );
  const openReports = Array.isArray(rows) ? rows : [];
  if (!openReports.length) return [];

  const reportIds = openReports.map((row) => row.id);
  const supportsOutcome = await settleFetch(
    fetchScopedByIds('report_supports', '?select=report_id,category,note,created_at', 'report_id', reportIds),
  );

  const byReport = new Map();
  if (supportsOutcome.error) {
    logSupabase('hot_cases_supports_failed', { message: String(supportsOutcome.error?.message || '').slice(0, 240) });
  } else {
    for (const row of supportsOutcome.data || []) {
      const key = String(row.report_id);
      if (!byReport.has(key)) byReport.set(key, { categories: [], voiceCount: 0 });
      const entry = byReport.get(key);
      if (row.category) entry.categories.push(row.category);
      const note = typeof row.note === 'string' ? row.note.trim() : '';
      if (note) entry.voiceCount += 1;
    }
  }

  const cases = openReports.map((report) => {
    const entry = byReport.get(String(report.id)) || { categories: [], voiceCount: 0 };
    const counts = {};
    if (report.category) counts[report.category] = (counts[report.category] || 0) + 1;
    for (const category of entry.categories) counts[category] = (counts[category] || 0) + 1;
    const facets = Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    const supportCount = Number(report.support_count || 0);
    const heat = computeHeat({ supportCount, distinctFacetCount: facets.length, voiceCount: entry.voiceCount });
    return {
      id: report.id,
      category: report.category || 'Melding',
      description: report.description || '',
      status: report.status || null,
      created_at: report.created_at || null,
      status_updated_at: report.status_updated_at || null,
      road_owner: report.road_owner || null,
      speed_limit: report.speed_limit ?? null,
      due_date: report.due_date || null,
      assignee_email: report.assignee_email || null,
      support_count: supportCount,
      voice_count: entry.voiceCount,
      facets,
      heat: Math.round(heat * 10) / 10,
    };
  });

  cases.sort((a, b) => b.heat - a.heat || b.support_count - a.support_count || new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return cases;
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
