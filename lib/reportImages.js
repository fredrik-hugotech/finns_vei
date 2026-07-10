export const REPORT_IMAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_REPORT_IMAGES || 'report-images';
export const REPORT_IMAGE_MAX_COUNT = Number(process.env.REPORT_IMAGE_MAX_COUNT || 3);
export const REPORT_IMAGE_MAX_BYTES = Number(process.env.REPORT_IMAGE_MAX_BYTES || 8 * 1024 * 1024);

// Staff-uploaded "after" photos proving a hazard was fixed (before/after proof
// on the public case page). Same per-file size limit as citizen uploads by
// default; the total stored per report is capped at this count too (oldest
// resolution photos are dropped first once the cap is hit).
export const RESOLUTION_IMAGE_MAX_COUNT = Number(process.env.RESOLUTION_IMAGE_MAX_COUNT || REPORT_IMAGE_MAX_COUNT);

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function reportImageConfig() {
  return {
    bucket: REPORT_IMAGE_BUCKET,
    maxCount: REPORT_IMAGE_MAX_COUNT,
    maxBytes: REPORT_IMAGE_MAX_BYTES,
    allowedTypes: [...ALLOWED_IMAGE_TYPES],
  };
}

export function isAllowedReportImageType(contentType = '', filename = '') {
  const normalized = String(contentType || '').toLowerCase();
  const extension = String(filename || '').toLowerCase().split('.').pop();
  if (['heic', 'heif'].includes(extension)) return true;
  return normalized.startsWith('image/') && (ALLOWED_IMAGE_TYPES.has(normalized) || normalized === 'image/jpg');
}

export function sanitizeImageFilename(name = 'bilde') {
  const cleaned = String(name || 'bilde')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return cleaned || 'bilde';
}

// Shared file validation for every image-upload endpoint (citizen report images,
// staff resolution photos, ...): field name, count and per-file size/type. Keeps
// the "reject with a clear Norwegian message" behavior in one place instead of
// duplicating it per endpoint.
export function validateReportImageFiles(files = [], {
  fieldName = 'images',
  maxCount = REPORT_IMAGE_MAX_COUNT,
  maxBytes = REPORT_IMAGE_MAX_BYTES,
} = {}) {
  const images = files.filter((file) => file.fieldName === fieldName && file.buffer?.length > 0);
  if (images.length > maxCount) throw new Error(`Du kan legge ved maks ${maxCount} bilder.`);
  images.forEach((file) => {
    if (!isAllowedReportImageType(file.contentType, file.filename)) throw new Error('Du kan bare laste opp bildefiler.');
    if (file.buffer.length > maxBytes) throw new Error(`Et bilde er for stort. Maks ${Math.round(maxBytes / (1024 * 1024))} MB per bilde.`);
  });
  return images;
}

// Storage path convention shared by every report-scoped upload: `reports/<id>/...`
// for citizen images, `reports/<id>/resolution/...` for staff "after" photos.
export function buildReportImagePath({ reportId, index = 0, filename, subdir = null }) {
  const safeName = sanitizeImageFilename(filename || `bilde-${index + 1}`);
  const parts = ['reports', reportId];
  if (subdir) parts.push(subdir);
  parts.push(`${Date.now()}-${index + 1}-${safeName}`);
  return parts.join('/');
}

export function normalizeImageEntries(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      return normalizeImageEntries(JSON.parse(value));
    } catch (_error) {
      return value ? [{ url: value }] : [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return { url: entry };
      if (!entry || typeof entry !== 'object') return null;
      return {
        url: entry.url || '',
        path: entry.path || null,
        content_type: entry.content_type || entry.contentType || null,
        size: Number(entry.size || 0) || null,
      };
    })
    .filter((entry) => entry?.url);
}
