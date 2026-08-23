/**
 * Fixed-window in-memory rate limiter (no external deps).
 * Suitable for a single-process deployment; use a shared store (e.g. Redis)
 * if running multiple instances.
 */
export function createRateLimiter({ windowMs = 60_000, max = 10, keyBy = (req) => req.ip } = {}) {
  const hits = new Map(); // key -> { count, windowStart }

  // Periodically evict stale entries so the map cannot grow unbounded.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.windowStart > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  return function rateLimit(req, res, next) {
    const key = keyBy(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
      hits.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('RateLimit-Reset', Math.ceil((entry.windowStart + windowMs - now) / 1000));
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.windowStart + windowMs - now) / 1000));
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests, slow down' });
    }
    next();
  };
}
