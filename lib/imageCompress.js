// Client-side image compression for the report form's photo attachments,
// using only native browser APIs (no library) — an off-screen <canvas> to
// downscale + re-encode as JPEG before upload. Runs entirely in the browser;
// never imported by API routes.
//
// Rationale (see reports/nightly/2026-07-09.md and 2026-07-10.md): phone
// photos can be several MB and this app is used in places with poor mobile
// coverage (tunnels, fjord roads, forest areas). Shrinking the image before
// upload measurably speeds up submission without needing a heavier/blurrier
// archival-quality copy — this is road-safety documentation, not a photo
// archive.
//
// Contract: this function must NEVER make the upload worse. Any failure,
// unsupported browser feature, or a "compressed" result that isn't actually
// smaller than the original falls back to returning the original File
// untouched. Callers can treat it as always-succeeds.

// Longest-side cap in pixels. 1600px is plenty to make out road conditions,
// signage, potholes etc. — well beyond what's needed for a report, but not
// so small that details get lost.
const MAX_DIMENSION = 1600;

// JPEG re-encode quality (0..1). 0.8 is a reasonable "good enough for review,
// not archival" trade-off.
const JPEG_QUALITY = 0.8;

// Below this size, skip compression entirely — the CPU/battery cost of
// decoding + re-encoding isn't worth it for an already-small photo, and
// small images are unlikely to shrink further anyway.
const SKIP_BELOW_BYTES = 300 * 1024;

function isHeicLike(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  // HEIC/HEIF decode support via canvas/createImageBitmap is inconsistent
  // across browsers (and this codebase already special-cases these
  // extensions in lib/reportImages.js) — safest to leave them untouched
  // rather than risk a corrupt or blank re-encode.
  return type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/.test(name);
}

function decodeViaImageElement(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Kunne ikke lese bildefilen'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Kunne ikke dekode bildet'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// createImageBitmap is fast and widely supported in modern browsers; the
// <img>+FileReader path is a fallback for older browsers (e.g. older Safari)
// where it's missing or throws on some inputs.
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch (_error) {
      // fall through to the <img> fallback below
    }
  }
  return decodeViaImageElement(file);
}

function sourceDimensions(source) {
  return {
    width: source.width || source.naturalWidth || 0,
    height: source.height || source.naturalHeight || 0,
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('canvas.toBlob støttes ikke'));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob); else reject(new Error('Kunne ikke kode bildet'));
    }, type, quality);
  });
}

function buildOutputFile(blob, originalFile) {
  const base = String(originalFile.name || 'bilde').replace(/\.[a-zA-Z0-9]+$/, '') || 'bilde';
  const name = `${base}.jpg`;
  if (typeof File === 'function') {
    try {
      return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    } catch (_error) {
      // fall through to returning the raw blob below
    }
  }
  // Some very old browsers don't support the File constructor with this
  // signature — a Blob is still a valid FormData part, just without a name,
  // so give it one manually for parity with a real File.
  try { blob.name = name; } catch (_error) { /* ignore */ }
  return blob;
}

/**
 * Compress an image File for upload, or return it untouched if compression
 * isn't applicable/safe/beneficial. Always resolves (never rejects) — any
 * internal failure falls back to the original file.
 *
 * @param {File} file
 * @param {{ maxDimension?: number, quality?: number, skipBelowBytes?: number }} [options]
 * @returns {Promise<File|Blob>}
 */
export async function compressImage(file, options = {}) {
  const maxDimension = options.maxDimension || MAX_DIMENSION;
  const quality = options.quality ?? JPEG_QUALITY;
  const skipBelowBytes = options.skipBelowBytes ?? SKIP_BELOW_BYTES;

  if (!file || typeof file.size !== 'number') return file;
  if (!String(file.type || '').startsWith('image/')) return file; // not an image type this helper touches
  if (isHeicLike(file)) return file;
  if (file.size <= skipBelowBytes) return file;
  if (typeof document === 'undefined') return file; // no DOM available (shouldn't happen client-side)

  let source = null;
  try {
    source = await decodeImage(file);
    const { width, height } = sourceDimensions(source);
    if (!width || !height) return file;

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (!blob || !blob.size || blob.size >= file.size) return file; // never make the upload worse

    return buildOutputFile(blob, file);
  } catch (_error) {
    return file;
  } finally {
    if (source && typeof source.close === 'function') source.close();
  }
}

export const IMAGE_COMPRESS_MAX_DIMENSION = MAX_DIMENSION;
export const IMAGE_COMPRESS_QUALITY = JPEG_QUALITY;
export const IMAGE_COMPRESS_SKIP_BELOW_BYTES = SKIP_BELOW_BYTES;
