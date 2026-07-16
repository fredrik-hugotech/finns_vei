export const REPORT_IMAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_REPORT_IMAGES || 'report-images';
export const REPORT_IMAGE_MAX_COUNT = Number(process.env.REPORT_IMAGE_MAX_COUNT || 3);
export const REPORT_IMAGE_MAX_BYTES = Number(process.env.REPORT_IMAGE_MAX_BYTES || 8 * 1024 * 1024);

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

// contentType values a client may send for a photo when it has no better
// guess (e.g. some mobile upload paths). Only these "no real information"
// values are eligible for the extension-based inference below - anything
// else (including e.g. text/html) is trusted at face value and checked
// straight against the allowlist.
const AMBIGUOUS_CONTENT_TYPES = new Set(['', 'application/octet-stream']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

export function reportImageConfig() {
  return {
    bucket: REPORT_IMAGE_BUCKET,
    maxCount: REPORT_IMAGE_MAX_COUNT,
    maxBytes: REPORT_IMAGE_MAX_BYTES,
    allowedTypes: [...ALLOWED_IMAGE_TYPES],
  };
}

// Resolves the canonical, allowlisted image content-type to use for storage,
// or null if the upload must be rejected. The declared `contentType` is
// ALWAYS validated against the allowlist - a `.heic`/`.heif` filename can
// never bypass that check. It previously did (any file named `x.heic` was
// accepted regardless of its declared contentType), which let a spoofed
// `Content-Type: text/html` upload get stored and served back as HTML from
// the storage domain - a stored-XSS vector. The filename extension is only
// used to *infer* a canonical type when the client didn't send a useful
// contentType at all (empty or the generic application/octet-stream), which
// is common for HEIC/HEIF photos straight off an iPhone. Even then, the
// inferred type still has to pass the same allowlist check below.
export function resolveReportImageContentType(contentType = '', filename = '') {
  let normalized = String(contentType || '').trim().toLowerCase();
  if (normalized === 'image/jpg') normalized = 'image/jpeg';

  if (AMBIGUOUS_CONTENT_TYPES.has(normalized)) {
    const extension = String(filename || '').toLowerCase().split('.').pop();
    if (HEIC_EXTENSIONS.has(extension)) normalized = `image/${extension}`;
  }

  return ALLOWED_IMAGE_TYPES.has(normalized) ? normalized : null;
}

export function isAllowedReportImageType(contentType = '', filename = '') {
  return resolveReportImageContentType(contentType, filename) !== null;
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
