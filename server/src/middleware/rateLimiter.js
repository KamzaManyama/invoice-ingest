/**
 * Rate limiting middleware — OWASP A05 (Security Misconfiguration)
 *
 * Three tiers:
 *  authLimiter   — login / signup / forgot-password  (strictest)
 *  uploadLimiter — file ingest endpoint
 *  apiLimiter    — all other authenticated routes
 *
 * Uses express-rate-limit with in-memory store (suitable for single-instance).
 * For multi-instance deploys, swap MemoryStore with RedisStore.
 *
 * All limiters return JSON (not HTML) and include Retry-After header.
 */
import rateLimit from 'express-rate-limit';

const jsonHandler = (req, res) => {
  res.status(429).json({
    error:      'Too many requests. Please wait before trying again.',
    retryAfter: res.getHeader('Retry-After'),
  });
};

/** Auth endpoints — 20 requests per 15 minutes per IP */
export const authLimiter = rateLimit({
  windowMs:         parseInt(process.env.RATE_AUTH_WINDOW_MS  || '900000', 10), // 15 min
  max:              parseInt(process.env.RATE_AUTH_MAX         || '20',     10),
  standardHeaders:  true,    // Return rate limit info in RateLimit-* headers
  legacyHeaders:    false,   // Disable X-RateLimit-* headers
  handler:          jsonHandler,
  skipSuccessfulRequests: false,
});

/** File upload / ingest — 10 requests per minute per IP */
export const uploadLimiter = rateLimit({
  windowMs:        parseInt(process.env.RATE_UPLOAD_WINDOW_MS || '60000', 10), // 1 min
  max:             parseInt(process.env.RATE_UPLOAD_MAX        || '10',    10),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler,
});

/** General API — 200 requests per minute per IP */
export const apiLimiter = rateLimit({
  windowMs:        parseInt(process.env.RATE_API_WINDOW_MS || '60000', 10), // 1 min
  max:             parseInt(process.env.RATE_API_MAX        || '200',   10),
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         jsonHandler,
});