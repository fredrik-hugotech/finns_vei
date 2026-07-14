import { isAdminRequest } from '../../../lib/backofficeAuth';
import { parseMultipartRequest } from '../../../lib/multipart';
import { uploadReportImage, createCaseAttachment, setCaseAttachmentVisibility, deleteCaseAttachment, hasSupabaseConfig } from '../../../lib/supabaseRest';
import { sanitizeImageFilename, isAllowedReportImageType } from '../../../lib/reportImages';

export const config = { api: { bodyParser: false } };

const MAX_BYTES = 10 * 1024 * 1024;
// Reuse the same allowlist as the public report-image upload path (excludes
// image/svg+xml — an inline <script> in an SVG served back from a public
// bucket would execute when opened directly). PDFs stay allowed since that
// was already a working attachment type here.
function allowed(contentType, filename) {
  const t = String(contentType || '').toLowerCase();
  return isAllowedReportImageType(t, filename) || t === 'application/pdf';
}

export default async function handler(req, res) {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: 'Forbidden' });
  if (!hasSupabaseConfig()) return res.status(503).json({ error: 'Supabase er ikke konfigurert' });

  try {
    // JSON actions: change visibility / delete
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      const { fields } = await parseMultipartRequest(req);
      if (req.method === 'PATCH') {
        if (!fields.id) return res.status(400).json({ error: 'Mangler id' });
        await setCaseAttachmentVisibility(fields.id, fields.visibility);
        return res.status(200).json({ ok: true });
      }
      if (!fields.id) return res.status(400).json({ error: 'Mangler id' });
      await deleteCaseAttachment(fields.id);
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') { res.setHeader('Allow', ['POST', 'PATCH', 'DELETE']); return res.status(405).end('Method Not Allowed'); }

    const { fields, files } = await parseMultipartRequest(req);
    const reportId = fields.reportId || fields.report_id;
    const visibility = fields.visibility === 'public' ? 'public' : 'internal';
    if (!reportId) return res.status(400).json({ error: 'Mangler sak-id' });

    const uploads = files.filter((f) => f.fieldName === 'file' && f.buffer?.length > 0);
    if (uploads.length === 0) return res.status(400).json({ error: 'Ingen fil valgt' });

    const created = [];
    for (const [index, file] of uploads.entries()) {
      if (!allowed(file.contentType, file.filename)) return res.status(400).json({ error: 'Kun bilder eller PDF.' });
      if (file.buffer.length > MAX_BYTES) return res.status(400).json({ error: 'Filen er for stor (maks 10 MB).' });
      const safeName = sanitizeImageFilename(file.filename || `vedlegg-${index + 1}`);
      const path = `cases/${reportId}/${Date.now()}-${index + 1}-${safeName}`;
      const result = await uploadReportImage({ path, buffer: file.buffer, contentType: file.contentType });
      const row = await createCaseAttachment({
        reportId, url: result.url, path: result.path, contentType: file.contentType, filename: file.filename || safeName, visibility, size: file.buffer.length,
      });
      created.push({ id: row?.id, url: result.url, filename: file.filename || safeName, content_type: file.contentType, visibility });
    }
    return res.status(201).json({ attachments: created });
  } catch (error) {
    console.error(error);
    return res.status(error?.status || 500).json({ error: error?.message || 'Kunne ikke laste opp.' });
  }
}
