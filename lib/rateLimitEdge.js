// Edge-runtime-safe counterpart to lib/rateLimit.js. Vercel Edge Functions
// (next/og image routes) run in an isolate without Node's `crypto` built-in
// that lib/rateLimit.js's IP hashing relies on, and receive a Fetch API
// `Request` (Headers.get(...)) rather than Node's IncomingMessage
// (req.headers[...]). Kept as a small, deliberately separate copy rather than
// sharing lib/rateLimit.js's module, so importing it never risks pulling
// Node-only code into an edge bundle.
//
// Same limitation as the Node-runtime limiter: purely in-memory,
// per-instance, fixed-window - a strict improvement over no limiting at all,
// not a hard global guarantee.

const buckets = new Map();
const MAX_BUCKETS = 2000;

function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded && forwarded.trim()) return forwarded.split(',')[0].trim();
  return '';
}

export function checkEdgeRateLimit(request, routeName, limit, windowMs) {
  const ip = clientIp(request);
  const key = ip ? `${routeName}:${ip}` : null;
  if (!key) return { allowed: true, remaining: limit, retryAfterMs: 0 };

  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    if (buckets.size >= MAX_BUCKETS) {
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
