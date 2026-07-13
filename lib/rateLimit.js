import crypto from 'crypto';

// Lightweight, dependency-free abuse guard for the public, unauthenticated
// POST endpoints (report / report-support / bike-trips). There is no login
// anywhere in this app, so IP-based rate limiting is the only cheap lever we
// have to raise the bar against a script hammering an endpoint.
//
// IMPORTANT LIMITATION: this is an in-memory, per-serverless-instance,
// fixed-window limiter. Vercel functions are not guaranteed to reuse the same
// warm instance/region across invocations, and each cold start (or
// concurrent instance) gets its own empty Map. So this does NOT provide a
// hard, global guarantee — a determined attacker spreading requests across
// many cold instances can still get through. For a real guarantee you would
// need a shared store such as Upstash Redis (or Vercel KV) keyed the same
// way. Even so, this is a strict improvement over today (zero rate limiting)
// and meaningfully slows down unsophisticated bots/scripts that keep hitting
// the same warm instance.

const buckets = new Map();

// Periodically forget old buckets so memory doesn't grow unbounded on a
// long-lived warm instance.
const MAX_BUCKETS = 5000;

/**
 * Hash an arbitrary identifier (e.g. client IP) the same way
 * pages/api/report-support.js already does, so hashes are consistent across
 * the codebase. Reuses SUPPORT_HASH_SALT / SUPABASE_SERVICE_ROLE_KEY as the
 * salt fallback chain already established there - no new env vars.
 */
export function hashValue(value) {
  if (!value) return null;
  const salt = process.env.SUPPORT_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'finns-vei-support';
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

/**
 * Extract the client IP for rate-limiting purposes.
 *
 * Nearest-hop trust model: on Vercel's edge, `x-forwarded-for` is a
 * client-supplied header that proxies APPEND to (they don't replace it), so
 * the FIRST entry is attacker-controlled - a script can send a fresh fake
 * first entry on every request to get a brand new rate-limit bucket each
 * time, defeating the limiter entirely. `x-real-ip` is set by Vercel's edge
 * itself and is not settable by the client through the edge, so prefer it.
 * When falling back to `x-forwarded-for`, use the LAST entry, which is the
 * value appended by the nearest trusted proxy/edge (i.e. the hop we
 * actually trust), not the first (client-supplied, spoofable) one.
 */
export function clientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket?.remoteAddress || '';
}

/**
 * Fixed-window rate limiter.
 *
 * @param {string} key - a stable identifier for the caller+route, e.g. a hashed IP scoped by route name.
 * @param {number} limit - max requests allowed within the window.
 * @param {number} windowMs - window size in milliseconds.
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(key, limit, windowMs) {
  if (!key) {
    // No identifiable caller (e.g. no IP at all) - fail open rather than
    // locking out every request behind a shared/unknown key.
    return { allowed: true, remaining: limit, retryAfterMs: 0 };
  }

  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    if (buckets.size >= MAX_BUCKETS) {
      // Cheap safety valve: drop the oldest-looking entry rather than let the
      // Map grow forever on a long-lived warm instance.
      const firstKey = buckets.keys().next().value;
      if (firstKey !== undefined) buckets.delete(firstKey);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

/**
 * Convenience helper: builds the per-route rate-limit key from the request's
 * client IP and checks it against the given budget.
 */
export function checkRequestRateLimit(req, routeName, limit, windowMs) {
  const ipHash = hashValue(clientIp(req));
  const key = ipHash ? `${routeName}:${ipHash}` : null;
  return checkRateLimit(key, limit, windowMs);
}
