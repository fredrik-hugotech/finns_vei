// Client-side image compression before upload, using only the browser-native
// <canvas> API — deliberately no image-compression npm dependency, so this
// doesn't need a library choice/bundle-size discussion to ship. Downscales a
// picked photo to a reasonable max dimension and re-encodes it as JPEG so
// slow mobile uploads (full-resolution phone photos on a weak connection)
// send far fewer bytes.
//
// This must NEVER block or break report submission: every failure path
// (unsupported format, canvas/security error, toBlob missing or failing,
// decode error, SSR) resolves with the original File untouched rather than
// throwing or rejecting.

// Longest-side cap in pixels. Report photos are viewed as small thumbnails
// and in a modest lightbox — 1600px keeps them sharp there while cutting
// typical 12MP+ phone photos down drastically.
export const IMAGE_COMPRESS_MAX_DIMENSION = 1600;
// JPEG quality passed to canvas.toBlob. 0.8 is a common "visually lossless
// enough" default for photos.
export const IMAGE_COMPRESS_QUALITY = 0.8;
// Files already under this size aren't worth a canvas round-trip.
export const IMAGE_COMPRESS_SKIP_UNDER_BYTES = 300 * 1024;

// HEIC/HEIF (common on iPhones) generally can't be decoded by <canvas>/<img>
// in browsers that don't already support the format natively — safer to skip
// compression entirely and let the original upload through untouched than to
// risk a broken/blank image.
function isLikelyCompressible(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return false;
  if (/\.(heic|heif)$/i.test(file?.name || '')) return false;
  return type.startsWith('image/');
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch (_error) {
      // Some browsers' createImageBitmap chokes on formats <img> still
      // decodes fine (or vice versa) — fall through and try the <img> path.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (error) => { URL.revokeObjectURL(url); reject(error); };
    img.src = url;
  });
}

/**
 * Compresses an image file client-side by downscaling it to
 * IMAGE_COMPRESS_MAX_DIMENSION on the longest side and re-encoding as JPEG.
 *
 * Always resolves (never rejects) with:
 *   { file, compressed, originalSize, compressedSize }
 * `file` is always safe to upload — the compressed result on success, or the
 * original File unchanged when compression is skipped or fails.
 */
export async function compressImageFile(file, {
  maxDimension = IMAGE_COMPRESS_MAX_DIMENSION,
  quality = IMAGE_COMPRESS_QUALITY,
  skipUnderBytes = IMAGE_COMPRESS_SKIP_UNDER_BYTES,
} = {}) {
  const fallback = { file, compressed: false, originalSize: file?.size || 0, compressedSize: file?.size || 0 };

  if (typeof document === 'undefined' || !file) return fallback;
  if (file.size <= skipUnderBytes) return fallback;
  if (!isLikelyCompressible(file)) return fallback;

  try {
    const bitmap = await loadBitmap(file);
    const width = bitmap.width || bitmap.naturalWidth || 0;
    const height = bitmap.height || bitmap.naturalHeight || 0;
    if (!width || !height) {
      bitmap.close?.();
      return fallback;
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return fallback;
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();

    if (typeof canvas.toBlob !== 'function') return fallback;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result); else reject(new Error('canvas.toBlob returned null'));
      }, 'image/jpeg', quality);
    });

    if (!blob || !blob.size || blob.size >= file.size) {
      // Compression didn't actually help (rare, but possible for already
      // small/simple images) — keep the original rather than swap it for a
      // same-size-or-bigger file.
      return fallback;
    }

    const baseName = String(file.name || 'bilde').replace(/\.[a-zA-Z0-9]+$/, '');
    const compressedFile = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });

    return {
      file: compressedFile,
      compressed: true,
      originalSize: file.size,
      compressedSize: compressedFile.size,
    };
  } catch (_error) {
    // Canvas/security/decode error of any kind — never let compression
    // trouble stand in the way of sending the report with the original file.
    return fallback;
  }
}
