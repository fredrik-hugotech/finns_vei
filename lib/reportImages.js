export const REPORT_IMAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_REPORT_IMAGES || 'report-images';
export const REPORT_IMAGE_MAX_COUNT = Number(process.env.REPORT_IMAGE_MAX_COUNT || 3);
export const REPORT_IMAGE_MAX_BYTES = Number(process.env.REPORT_IMAGE_MAX_BYTES || 8 * 1024 * 1024);

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
  const normalized = String(contentType || '').trim().toLowerCase();
  const extension = String(filename || '').toLowerCase().split('.').pop();
  const isHeicExtension = ['heic', 'heif'].includes(extension);

  if (normalized) {
    // A Content-Type was supplied — it must always pass the allowlist, the
    // same as every other type. The extension alone is never allowed to
    // override an actively-wrong/unexpected Content-Type (e.g. a file named
    // x.heic uploaded as text/html).
    if (normalized.startsWith('image/')) {
      return ALLOWED_IMAGE_TYPES.has(normalized) || normalized === 'image/jpg';
    }
    // Some browsers/OSes send a generic binary placeholder for HEIC/HEIF
    // uploads instead of a proper image/* type — fall back to the extension
    // only for that known-generic case, not for a type actively claiming to
    // be something else.
    return isHeicExtension && normalized === 'application/octet-stream';
  }

  // No Content-Type at all — trust the extension only for heic/heif, same
  // generous fallback as above.
  return isHeicExtension;
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
