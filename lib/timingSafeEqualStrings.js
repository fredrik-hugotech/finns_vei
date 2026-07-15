import crypto from 'crypto';

// Shared by lib/backofficeAuth.js and lib/envStatus.js: constant-time string
// comparison for secret checks, so a wrong-length/wrong-value secret doesn't
// leak timing information.
export function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
