// Verifies uploaded file bytes actually match the declared/resolved
// content-type, instead of trusting only the (client-controlled) allowlist
// check in lib/reportImages.js. Without this, a request could declare
// Content-Type: image/jpeg (or application/pdf) while uploading an
// HTML/script polyglot, which would then be stored in a public bucket and
// served back with that attacker-chosen content-type header.
function isHeic(buffer) {
  if (buffer.length < 12) return false;
  if (buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buffer.toString('ascii', 8, 12);
  return ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand);
}

const SIGNATURES = {
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (buf) => buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a'),
  'image/webp': (buf) => buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP',
  'image/heic': isHeic,
  'image/heif': isHeic,
  'application/pdf': (buf) => buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-',
};

// Returns true when there's no known signature to check (nothing to
// contradict), or when the buffer's actual bytes match the declared type.
export function matchesFileSignature(buffer, contentType) {
  const check = SIGNATURES[contentType];
  if (!check || !Buffer.isBuffer(buffer)) return true;
  try {
    return Boolean(check(buffer));
  } catch (_e) {
    return false;
  }
}
