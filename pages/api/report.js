import { REPORT_CATEGORIES, REPORT_STATUS, REPORTER_TYPES } from '../../lib/config';
import { runReportWorkflowBestEffort } from '../../lib/reportWorkflow';
import { createReport, hasSupabaseConfig, updateReportImages, uploadReportImage } from '../../lib/supabaseRest';
import { distanceMeters, randomOffsetPoint, snapToGrid, CLIP_METERS } from '../../lib/geoPrivacy';
import { resolveReportImageContentType, REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_COUNT, sanitizeImageFilename } from '../../lib/reportImages';
import { matchesFileSignature } from '../../lib/fileSignature';
import { checkRequestRateLimit } from '../../lib/rateLimit';
import { parseMultipartRequest } from '../../lib/multipart';

export const config = {
  api: {
    bodyParser: false,
  },
};

// ~8 reports per 10 minutes per IP hash - generous enough for one household
// or school class reporting several spots in a row from shared wifi/NAT,
// tight enough to blunt a script hammering the endpoint.
const RATE_LIMIT = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Honeypot field name used in components/ReportSheet.js. Real users never
// see or fill it (visually hidden, not display:none, so it still behaves
// like a real field to bots/autofill); if it arrives non-empty we silently
// reject the submission as if it were bad input.
const HONEYPOT_FIELD = 'nettside';

function logApi(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/report', event, ...details }));
}

function cleanString(value, maxLength = 1000) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

// User-facing Norwegian validation messages are safe to return as-is. Marked
// with `.safe` so the top-level handler can tell them apart from raw
// backend/Supabase error text, which must never reach an anonymous caller.
function invalidInput(message) {
  const error = new Error(message);
  error.status = 400;
  error.safe = true;
  return error;
}

function parseCoordinate(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw invalidInput(`${name} mangler`);
  return number;
}

// Optional: present only when a report was created mid-trip (TripTracker's
// "marker utrygt punkt", i.e. a report tied to an active bike/walk trip).
// Same "case" as any other report — see validatePayload — just with a trip
// context attached, used below only to decide whether the reported point
// needs privacy protection. Never returned/stored: this function reads it
// purely to make that one decision, then it's discarded.
function parseOptionalCoordinate(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validatePayload(body = {}) {
  const reporterType = body.reporter_type === REPORTER_TYPES.ADULT ? REPORTER_TYPES.ADULT : REPORTER_TYPES.CHILD;
  let lat = parseCoordinate(body.lat, 'Posisjon');
  let lng = parseCoordinate(body.lng, 'Posisjon');

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw invalidInput('Posisjonen ser ikke riktig ut');
  }

  // Defense in depth for reports tied to a bike/walk trip: the client
  // (TripTracker.js) already snaps a near-start point to the coarse grid
  // before sending it, but never trust that alone — a request straight to
  // this endpoint could skip it entirely. If the caller also declares the
  // trip's start point, re-derive an independent, randomly-offset stand-in
  // for it here (never the raw declared start itself, same principle as
  // createBikeTrip) and snap the reported point if it falls within the
  // privacy radius of that stand-in — regardless of what the client already
  // did. The declared start itself is never stored or returned.
  const tripStartLat = parseOptionalCoordinate(body.trip_start_lat);
  const tripStartLng = parseOptionalCoordinate(body.trip_start_lng);
  if (tripStartLat !== null && tripStartLng !== null) {
    const homeRef = randomOffsetPoint({ lat: tripStartLat, lng: tripStartLng });
    if (homeRef && distanceMeters({ lat, lng }, homeRef) <= CLIP_METERS) {
      const snapped = snapToGrid(lat, lng);
      if (snapped) { lat = snapped.lat; lng = snapped.lng; }
    }
  }

  const category = REPORT_CATEGORIES.includes(body.category) ? body.category : null;
  if (!category) throw invalidInput('Velg en kategori');

  const description = cleanString(body.description, 1200);
  if (!description || description.length < 3) {
    throw invalidInput('Skriv en kort beskrivelse');
  }

  const bikeRouteType = body.bike_route_type === 'skole' ? 'skole' : (body.bike_route_type === 'fritid' ? 'fritid' : null);

  return {
    status: REPORT_STATUS.NEW,
    nvdb_status: 'pending',
    reporter_type: reporterType,
    category,
    description,
    lat,
    lng,
    ...(bikeRouteType ? { bike_route_type: bikeRouteType } : {}),
    contact_name: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_name, 160) : null,
    contact_email: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_email, 220) : null,
    contact_phone: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_phone, 80) : null,
  };
}

function validateImages(files = []) {
  const images = files.filter((file) => file.fieldName === 'images' && file.buffer?.length > 0);
  if (images.length > REPORT_IMAGE_MAX_COUNT) throw invalidInput(`Du kan legge ved maks ${REPORT_IMAGE_MAX_COUNT} bilder.`);
  images.forEach((file) => {
    const canonicalType = resolveReportImageContentType(file.contentType, file.filename);
    if (!canonicalType) throw invalidInput('Du kan bare laste opp bildefiler.');
    // The allowlist above only checks the client-declared header/extension,
    // which an anonymous request can freely set — verify the actual file
    // bytes match before it's stored in the public bucket and served back
    // with that (still attacker-chosen, absent this check) content-type.
    if (!matchesFileSignature(file.buffer, canonicalType)) throw invalidInput('Du kan bare laste opp bildefiler.');
    // Normalize to the validated, allowlisted type so the raw client-supplied
    // contentType (which can be spoofed, e.g. text/html) is never the value
    // written as the storage object's Content-Type header downstream.
    file.contentType = canonicalType;
    if (file.buffer.length > REPORT_IMAGE_MAX_BYTES) throw invalidInput('Et bilde er for stort. Maks 8 MB per bilde.');
  });
  return images;
}

async function uploadImagesBestEffort(reportId, files = []) {
  // Independent uploads (different storage paths) — run them concurrently
  // instead of one-at-a-time so 2-3 photos don't serialize their latency.
  const results = await Promise.allSettled(files.map(async (file, index) => {
    const safeName = sanitizeImageFilename(file.filename || `bilde-${index + 1}`);
    const path = `reports/${reportId}/${Date.now()}-${index + 1}-${safeName}`;
    const result = await uploadReportImage({ path, buffer: file.buffer, contentType: file.contentType });
    return {
      url: result.url,
      path: result.path,
      content_type: file.contentType,
      size: file.buffer.length,
    };
  }));

  const uploaded = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      uploaded.push(result.value);
    } else {
      const file = files[index];
      const error = result.reason;
      logApi('image_upload_failed', { reportId, index, contentType: file?.contentType, size: file?.buffer?.length, status: error?.status || null, message: String(error?.message || '').slice(0, 240) });
    }
  });
  return uploaded;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const rateLimit = checkRequestRateLimit(req, 'report', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    logApi('rate_limited', { retryAfterMs: rateLimit.retryAfterMs });
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }

  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase er ikke konfigurert' });
  }

  try {
    const { fields, files } = await parseMultipartRequest(req);

    // Honeypot: real users never see/fill this field, so a non-empty value
    // means a bot filled the form. Reject with the same generic 400 shape as
    // other bad input so the mechanism isn't revealed.
    if (String(fields?.[HONEYPOT_FIELD] || '').trim()) {
      logApi('honeypot_triggered', { field: HONEYPOT_FIELD });
      throw invalidInput('Ugyldig innsending');
    }

    const reportInput = validatePayload(fields);
    const imageFiles = validateImages(files);
    const insertedReport = await createReport(reportInput);

    if (!insertedReport?.id) {
      logApi('insert_missing_id', { category: reportInput.category, lat: reportInput.lat, lng: reportInput.lng });
      throw new Error('Rapporten ble lagret uten ID');
    }

    logApi('report_inserted', {
      reportId: insertedReport.id,
      category: insertedReport.category || reportInput.category,
      lat: insertedReport.lat || reportInput.lat,
      lng: insertedReport.lng || reportInput.lng,
      imageCount: imageFiles.length,
    });

    const uploadedImages = imageFiles.length ? await uploadImagesBestEffort(insertedReport.id, imageFiles) : [];
    let reportWithImages = { ...reportInput, ...insertedReport, image_urls: uploadedImages };
    let imageWarning = null;
    if (imageFiles.length && uploadedImages.length === 0) {
      imageWarning = 'Bilde kunne ikke lastes opp. Meldingen ble sendt uten bilde.';
    } else if (uploadedImages.length) {
      try {
        const updated = await updateReportImages(insertedReport.id, uploadedImages);
        reportWithImages = { ...reportWithImages, ...updated, image_urls: uploadedImages };
      } catch (error) {
        imageWarning = 'Bilde kunne ikke lagres på meldingen. Meldingen ble sendt uten bilde.';
        reportWithImages = { ...reportWithImages, image_urls: [] };
        logApi('image_metadata_update_failed', { reportId: insertedReport.id, status: error?.status || null, message: String(error?.message || '').slice(0, 240) });
      }
    }

    // Vercel serverless functions can stop after the response is returned, so the
    // Trello + NVDB workflow is awaited best-effort instead of fire-and-forget.
    const workflow = await runReportWorkflowBestEffort(reportWithImages);
    const report = workflow.report || reportWithImages;
    const warning = imageWarning || workflow.trelloWarning || null;

    return res.status(201).json({
      id: report.id,
      status: report.status || REPORT_STATUS.NEW,
      nvdb_status: workflow.nvdbStatus || report.nvdb_status || 'failed',
      warning,
      image_count: uploadedImages.length,
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/report', event: 'request_failed', status: error?.status || null, error: error?.message }));
    // Only messages explicitly marked `.safe` (our own validation/upload
    // checks) are ever shown to the caller — anything else (e.g. raw
    // PostgREST/Supabase error text bubbling up from createReport) would leak
    // internal schema/backend details to an anonymous public submitter.
    const message = error?.safe ? error.message : 'Kunne ikke lagre meldingen. Prøv igjen om litt.';
    return res.status(error?.status || 500).json({ error: message });
  }
}
