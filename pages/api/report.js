import { REPORT_CATEGORIES, REPORT_STATUS, REPORTER_TYPES } from '../../lib/config';
import { runReportWorkflowBestEffort } from '../../lib/reportWorkflow';
import { createReport, hasSupabaseConfig, updateReportImages, uploadReportImage } from '../../lib/supabaseRest';
import { isAllowedReportImageType, REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_COUNT, sanitizeImageFilename } from '../../lib/reportImages';

export const config = {
  api: {
    bodyParser: false,
  },
};

function logApi(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/report', event, ...details }));
}

function cleanString(value, maxLength = 1000) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function parseCoordinate(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} mangler`);
  return number;
}

async function readRequestBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function parseContentDisposition(value = '') {
  const result = {};
  String(value).split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey || !rest.length) return;
    result[rawKey.toLowerCase()] = rest.join('=').trim().replace(/^"|"$/g, '');
  });
  return result;
}

function parseMultipart(buffer, contentType = '') {
  const match = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  if (!match) throw new Error('Ugyldig bildeopplasting');
  const boundary = `--${match[1] || match[2]}`;
  const body = buffer.toString('latin1');
  const fields = {};
  const files = [];

  body.split(boundary).forEach((part) => {
    if (!part || part === '--\r\n' || part === '--') return;
    const normalized = part.replace(/^\r\n/, '').replace(/\r\n--$/, '');
    const separator = normalized.indexOf('\r\n\r\n');
    if (separator === -1) return;
    const rawHeaders = normalized.slice(0, separator);
    let rawContent = normalized.slice(separator + 4);
    if (rawContent.endsWith('\r\n')) rawContent = rawContent.slice(0, -2);

    const headers = Object.fromEntries(rawHeaders.split('\r\n').map((line) => {
      const index = line.indexOf(':');
      if (index === -1) return null;
      return [line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim()];
    }).filter(Boolean));
    const disposition = parseContentDisposition(headers['content-disposition']);
    const name = disposition.name;
    if (!name) return;

    if (disposition.filename) {
      files.push({
        fieldName: name,
        filename: disposition.filename,
        contentType: headers['content-type'] || 'application/octet-stream',
        buffer: Buffer.from(rawContent, 'latin1'),
      });
    } else {
      fields[name] = Buffer.from(rawContent, 'latin1').toString('utf8');
    }
  });

  return { fields, files };
}

async function parseRequest(req) {
  const contentType = req.headers['content-type'] || '';
  const buffer = await readRequestBuffer(req);
  if (contentType.includes('multipart/form-data')) return parseMultipart(buffer, contentType);
  if (contentType.includes('application/json')) {
    return { fields: JSON.parse(buffer.toString('utf8') || '{}'), files: [] };
  }
  return { fields: {}, files: [] };
}

function validatePayload(body = {}) {
  const reporterType = body.reporter_type === REPORTER_TYPES.ADULT ? REPORTER_TYPES.ADULT : REPORTER_TYPES.CHILD;
  const lat = parseCoordinate(body.lat, 'Posisjon');
  const lng = parseCoordinate(body.lng, 'Posisjon');

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Posisjonen ser ikke riktig ut');
  }

  const category = REPORT_CATEGORIES.includes(body.category) ? body.category : null;
  if (!category) throw new Error('Velg en kategori');

  const description = cleanString(body.description, 1200);
  if (!description || description.length < 3) {
    throw new Error('Skriv en kort beskrivelse');
  }

  return {
    status: REPORT_STATUS.NEW,
    nvdb_status: 'pending',
    reporter_type: reporterType,
    category,
    description,
    lat,
    lng,
    contact_name: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_name, 160) : null,
    contact_email: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_email, 220) : null,
    contact_phone: reporterType === REPORTER_TYPES.ADULT ? cleanString(body.contact_phone, 80) : null,
  };
}

function validateImages(files = []) {
  const images = files.filter((file) => file.fieldName === 'images' && file.buffer?.length > 0);
  if (images.length > REPORT_IMAGE_MAX_COUNT) throw new Error(`Du kan legge ved maks ${REPORT_IMAGE_MAX_COUNT} bilder.`);
  images.forEach((file) => {
    if (!isAllowedReportImageType(file.contentType, file.filename)) throw new Error('Du kan bare laste opp bildefiler.');
    if (file.buffer.length > REPORT_IMAGE_MAX_BYTES) throw new Error('Et bilde er for stort. Maks 8 MB per bilde.');
  });
  return images;
}

async function uploadImagesBestEffort(reportId, files = []) {
  const uploaded = [];
  for (const [index, file] of files.entries()) {
    const safeName = sanitizeImageFilename(file.filename || `bilde-${index + 1}`);
    const path = `reports/${reportId}/${Date.now()}-${index + 1}-${safeName}`;
    try {
      const result = await uploadReportImage({ path, buffer: file.buffer, contentType: file.contentType });
      uploaded.push({
        url: result.url,
        path: result.path,
        content_type: file.contentType,
        size: file.buffer.length,
      });
    } catch (error) {
      logApi('image_upload_failed', { reportId, index, contentType: file.contentType, size: file.buffer.length, status: error?.status || null, message: String(error?.message || '').slice(0, 240) });
    }
  }
  return uploaded;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase er ikke konfigurert' });
  }

  try {
    const { fields, files } = await parseRequest(req);
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
    console.error(JSON.stringify({ scope: 'api/report', event: 'request_failed', error: error?.message }));
    return res.status(400).json({ error: error.message || 'Kunne ikke lagre meldingen' });
  }
}
