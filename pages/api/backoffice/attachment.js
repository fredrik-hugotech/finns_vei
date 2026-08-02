import { isAdminRequest } from '../../../lib/backofficeAuth';
import { parseMultipartRequest } from '../../../lib/multipart';
import { uploadReportImage, createCaseAttachment, setCaseAttachmentVisibility, deleteCaseAttachment, hasSupabaseConfig, getReportById } from '../../../lib/supabaseRest';
import { sanitizeImageFilename, resolveReportImageContentType } from '../../../lib/reportImages';
import { checkRequestRateLimit } from '../../../lib/rateLimit';

export const config = { api: { bodyParser: false } };

const MAX_BYTES = 10 * 1024 * 1024;
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
// Same pattern already used to validate report-support.js's reportId.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Reuse the same allowlist as the public report-image upload path (excludes
// image/svg+xml — an inline <script> in an SVG served back from a public
// bucket would execute when opened directly). PDFs stay allowed since that
// was already a working attachment type here. Returns the canonical
// content-type to actually store (never the raw, potentially spoofed client
// value) or null if the upload must be rejected.
function resolveAllowedContentType(contentType, filename) {
  const t = String(contentType || '').toLowerCase();
  if (t === 'application/pdf') return 'application/pdf';
  return resolveReportImageContentType(contentType, filename);
}

export default async function handler(req, res) {
  const rateLimit = checkRequestRateLimit(req, 'backoffice-attachment', RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil(rateLimit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
  }
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
    // reportId is embedded directly in the storage path below (report-images
    // is a public bucket) — require it to look like a real UUID and resolve
    // to an existing report before using it in a path, so it can't be used to
    // write outside the intended cases/<reportId>/ prefix.
    if (!UUID_RE.test(String(reportId))) return res.status(400).json({ error: 'Ugyldig sak-id' });
    const targetReport = await getReportById(reportId);
    if (!targetReport) return res.status(404).json({ error: 'Fant ikke saken' });

    const uploads = files.filter((f) => f.fieldName === 'file' && f.buffer?.length > 0);
    if (uploads.length === 0) return res.status(400).json({ error: 'Ingen fil valgt' });

    // Validate every file up front (no async) before uploading anything, so a
    // bad file later in the batch can't leave earlier files already uploaded
    // as orphans — then upload the validated files concurrently, since each
    // goes to an independent storage path.
    const validated = uploads.map((file, index) => {
      const resolvedType = resolveAllowedContentType(file.contentType, file.filename);
      if (!resolvedType) throw Object.assign(new Error('Kun bilder eller PDF.'), { status: 400 });
      if (file.buffer.length > MAX_BYTES) throw Object.assign(new Error('Filen er for stor (maks 10 MB).'), { status: 400 });
      return { file, index, resolvedType, safeName: sanitizeImageFilename(file.filename || `vedlegg-${index + 1}`) };
    });

    const created = await Promise.all(validated.map(async ({ file, index, resolvedType, safeName }) => {
      const path = `cases/${reportId}/${Date.now()}-${index + 1}-${safeName}`;
      const result = await uploadReportImage({ path, buffer: file.buffer, contentType: resolvedType });
      const row = await createCaseAttachment({
        reportId, url: result.url, path: result.path, contentType: resolvedType, filename: file.filename || safeName, visibility, size: file.buffer.length,
      });
      return { id: row?.id, url: result.url, filename: file.filename || safeName, content_type: resolvedType, visibility };
    }));
    return res.status(201).json({ attachments: created });
  } catch (error) {
    console.error(error);
    return res.status(error?.status || 500).json({ error: error?.message || 'Kunne ikke laste opp.' });
  }
}
