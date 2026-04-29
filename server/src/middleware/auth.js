/**
 * Authentication & authorisation middleware — OWASP A01 (Broken Access Control)
 *
 * requireAuth:
 *  - Extracts Bearer token from Authorization header
 *  - Verifies JWT signature and expiry
 *  - Fetches fresh user+org row to catch suspended accounts mid-session
 *  - Attaches req.user, req.orgId, req.org
 *
 * requireRole(...roles):
 *  - Checks req.user.role against the allowed list
 *  - Returns 403 with a plain message (no role leakage)
 *
 * Security notes:
 *  - JWT secret must be ≥64 random bytes (enforced in authService)
 *  - Token is never logged — Morgan skips Authorization header by default
 *  - DB query on every request ensures revoked/suspended users are blocked
 */
import { verifyToken } from '../services/authService.js';
import pool from '../config/db.js';

export async function requireAuth(req, res, next) {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = header.slice(7);

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    // Distinguish expired vs invalid — useful for client-side handling
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }
    return res.status(401).json({ error: 'Invalid session. Please sign in again.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         u.id, u.first_name, u.last_name, u.email, u.role, u.status,
         o.id           AS org_id,
         o.name         AS org_name,
         o.trading_name,
         o.plan,
         o.vat_rate,
         o.approval_threshold,
         o.timezone
       FROM users u
       INNER JOIN organisations o ON o.id = u.org_id
       WHERE u.id = ? AND u.status = 'active'
       LIMIT 1`,
      [payload.userId]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Account not found or has been suspended.' });
    }

    const r = rows[0];

    req.user  = {
      id:        r.id,
      firstName: r.first_name,
      lastName:  r.last_name,
      email:     r.email,
      role:      r.role,
    };
    req.orgId = r.org_id;
    req.org   = {
      id:                r.org_id,
      name:              r.org_name,
      tradingName:       r.trading_name,
      plan:              r.plan,
      vatRate:           r.vat_rate,
      approvalThreshold: r.approval_threshold,
      timezone:          r.timezone,
    };

    next();
  } catch (err) {
    console.error('[auth] DB error during token validation:', err.message);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
}

/**
 * Role-based access control guard.
 * Must be used after requireAuth.
 *
 * @param {...string} roles - Allowed roles
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      // Don't reveal which roles are allowed — just deny
      return res.status(403).json({ error: "You don't have permission to perform this action." });
    }
    next();
  };
}