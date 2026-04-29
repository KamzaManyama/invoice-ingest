/**
 * Centralised error handler — OWASP A09 (Security Logging and Monitoring)
 *
 * Security rules:
 *  - Never expose stack traces in production responses
 *  - Never expose internal DB error messages to clients
 *  - Log all 5xx errors server-side
 *  - Map known error codes to safe, user-friendly messages
 *  - Always return JSON (not HTML)
 */

const SAFE_DB_MESSAGES = {
  ER_DUP_ENTRY:           'This record already exists.',
  ER_NO_REFERENCED_ROW:   'Referenced record not found.',
  ER_ROW_IS_REFERENCED:   'Cannot delete — this record is in use.',
  ECONNREFUSED:           'Database is temporarily unavailable. Please try again shortly.',
  PROTOCOL_CONNECTION_LOST: 'Database connection lost. Please try again.',
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status  = err.status || err.statusCode || 500;
  const isDev   = process.env.NODE_ENV === 'development';

  // Log all errors server-side
  console.error(`[error] ${req.method} ${req.path} → ${status}: ${err.message}`);
  if (status >= 500) console.error(err.stack);

  // Safe message for client
  let message = err.message || 'An unexpected error occurred.';

  // Replace raw DB errors with safe messages
  if (err.code && SAFE_DB_MESSAGES[err.code]) {
    message = SAFE_DB_MESSAGES[err.code];
  }

  // Never send internal messages for 5xx in production
  if (status >= 500 && !isDev) {
    message = 'An internal server error occurred. Please try again later.';
  }

  res.status(status).json({
    error: message,
    // Only include stack in development
    ...(isDev && status >= 500 && { stack: err.stack }),
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Endpoint not found: ${req.method} ${req.path}` });
}