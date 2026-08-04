// Best-effort client-side downscale/re-encode of a report photo before
// upload. Phone-camera photos are commonly 3-8 MB at resolutions far beyond
// what's ever shown (a thumbnail/lightbox on the case page) - this trims
// that down so citizens reporting from the street on weak mobile data don't
// pay for pixels nobody will see.
//
// This is a pure optimization, matching the "best effort, never blocks the
// core flow" pattern used elsewhere in this app (NVDB enrichment, Trello
// card creation, ...): any failure - unsupported format, a canvas error, a
// HEIC file the browser can't decode, or a "compressed" result that isn't
// actually smaller - falls back to returning the original file untouched.
// Callers should NOT treat a rejected/failed promise as fatal, but this
// function never rejects; it always resolves, worst case with the input file.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export function isHeicFile(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(file?.name || '');
}

function loadImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  // Safari-on-old-iOS-style fallback: decode via <img> + object URL.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (error) => { URL.revokeObjectURL(url); reject(error); };
    img.src = url;
  });
}

// Resolves with a re-encoded, downscaled File when that turns out smaller
// than the original, or with the original File unchanged otherwise (including
// on any error). Never rejects, never throws.
export async function compressImageFile(file) {
  if (typeof document === 'undefined' || isHeicFile(file)) return file;

  try {
    const source = await loadImageSource(file);
    const width = source.width || source.naturalWidth || 0;
    const height = source.height || source.naturalHeight || 0;
    if (!width || !height) return file;

    // Only ever downscale - a smaller-than-target source is left as-is.
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    if (typeof source.close === 'function') source.close();

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob || blob.size <= 0 || blob.size >= file.size) return file;

    return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (_error) {
    return file;
  }
}
