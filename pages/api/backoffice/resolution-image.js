import { isAdminRequest } from '../../../lib/backofficeAuth';
import { parseMultipartRequest } from '../../../lib/multipart';
import { appendReportResolutionImages, getReportById, hasSupabaseConfig, uploadReportImage } from '../../../lib/supabaseRest';
import { buildReportImagePath, RESOLUTION_IMAGE_MAX_COUNT, validateReportImageFiles } from '../../../lib/reportImages';

export const config = { api: { bodyParser: false } };

function logApi(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/backoffice/resolution-image', event, ...details }));
}

// Staff-only: upload 1-3 "after" photos proving a hazard was fixed. Appends to
// (never overwrites) reports.resolution_image_urls, and reuses the exact same
// validation/upload pipeline as the citizen report-image flow in
// lib/reportImages.js, just with a `resolution` storage-path suffix.
export default async function handler(req, res) {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Forbidden' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase er ikke konfigurert' });

  try {
    const { fields, files } = await parseMultipartRequest(req);
    const reportId = fields.reportId || fields.report_id;
    if (!reportId) return res.status(400).json({ error: 'Mangler sak-id' });

    const report = await getReportById(reportId);
    if (!report) return res.status(404).json({ error: 'Fant ikke saken' });

    const imageFiles = validateReportImageFiles(files, { fieldName: 'images', maxCount: RESOLUTION_IMAGE_MAX_COUNT });
    if (!imageFiles.length) return res.status(400).json({ error: 'Ingen bilde valgt' });

    const uploaded = [];
    for (const [index, file] of imageFiles.entries()) {
      const path = buildReportImagePath({ reportId, index, filename: file.filename, subdir: 'resolution' });
      try {
        const result = await uploadReportImage({ path, buffer: file.buffer, contentType: file.contentType });
        uploaded.push({
          url: result.url,
          path: result.path,
          content_type: file.contentType,
          size: file.buffer.length,
        });
      } catch (error) {
        logApi('image_upload_failed', { reportId, index, status: error?.status || null, message: String(error?.message || '').slice(0, 240) });
      }
    }

    if (!uploaded.length) {
      return res.status(502).json({ error: 'Kunne ikke laste opp bilde(t). Prøv igjen.' });
    }

    const result = await appendReportResolutionImages(reportId, uploaded);

    logApi('resolution_images_uploaded', { reportId, uploadedCount: uploaded.length, dbSaved: result.ok });

    return res.status(201).json({
      ok: true,
      images: result.images.map((img) => img.url).filter(Boolean),
      db_saved: result.ok,
      warning: result.ok
        ? null
        : 'Bildet ble lastet opp, men kunne ikke lagres på saken ennå (kolonnen resolution_image_urls mangler i databasen). Kjør migreringen i README (seksjonen om før/etter-bilder) for å vise bildet offentlig.',
    });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'api/backoffice/resolution-image', event: 'request_failed', error: error?.message }));
    return res.status(error?.status || 400).json({ error: error?.message || 'Kunne ikke laste opp bilde' });
  }
}
