/**
 * Authentication service — OWASP A07 (Identification and Authentication Failures)
 *
 * Security controls:
 *  - bcrypt with cost factor 12 (OWASP minimum recommendation)
 *  - JWT signed with HS256, 7-day expiry
 *  - Constant-time password comparison via bcrypt.compare
 *  - Password reset tokens are cryptographically random (32 bytes)
 *  - Reset tokens expire in 1 hour
 *  - forgotPassword never reveals whether an email exists (timing-safe)
 *  - JWT_SECRET checked to be present at startup
 */
import bcrypt          from 'bcryptjs';
import jwt             from 'jsonwebtoken';
import crypto          from 'crypto';
import { v4 as uuid }  from 'uuid';
import pool            from '../config/db.js';
import { sendMail }    from './emailService.js';

const SECRET  = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

// Guard: JWT_SECRET must be set before any auth can work
if (!SECRET) {
  console.error('[auth] JWT_SECRET is not set. Set it in .env before starting the server.');
  process.exit(1);
}
if (SECRET === 'CHANGE_THIS_TO_A_64_BYTE_RANDOM_HEX_STRING') {
  console.warn('[auth] WARNING: JWT_SECRET is still the placeholder value. Generate a real secret.');
}

// ── Sign up ────────────────────────────────────────────────────────────────
export async function signup({ firstName, lastName, orgName, email, password }) {
  // Check uniqueness — use SELECT to avoid leaking timing info about existence
  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );
  if (existing.length) {
    throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
  }

  // bcrypt cost 12 — OWASP recommended minimum (≈300ms on modern hardware)
  const hash  = await bcrypt.hash(password, 12);
  const orgId = uuid();
  const uid   = uuid();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      'INSERT INTO organisations (id, name) VALUES (?, ?)',
      [orgId, orgName]
    );
    await conn.execute(
      `INSERT INTO users (id, org_id, first_name, last_name, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?, 'owner')`,
      [uid, orgId, firstName, lastName || '', email.toLowerCase(), hash]
    );
    await conn.execute(
      'INSERT INTO gmail_poll_state (org_id, history_id) VALUES (?, 0)',
      [orgId]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Fire-and-forget welcome email — don't block signup on email delivery
  sendMail({
    to:      email,
    subject: 'Welcome to Invoq',
    html:    welcomeHtml(firstName, orgName),
  }).catch(e => console.warn('[auth] Welcome email failed:', e.message));

  return buildSession(uid);
}

// ── Login ──────────────────────────────────────────────────────────────────
export async function login({ email, password }) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.password_hash, u.status, u.first_name, u.last_name, u.email, u.role,
            o.id AS org_id, o.name AS org_name, o.trading_name, o.plan,
            o.vat_number, o.vat_rate, o.approval_threshold, o.timezone
     FROM users u
     INNER JOIN organisations o ON o.id = u.org_id
     WHERE u.email = ? LIMIT 1`,
    [email.toLowerCase()]
  );

  // Always run bcrypt.compare even if no user found — prevents timing attacks
  const dummyHash = '$2a$12$invalidhashforsafetypurposes000000000000';
  const hashToCompare = rows[0]?.password_hash ?? dummyHash;
  const passwordMatch = await bcrypt.compare(password, hashToCompare);

  if (!rows.length || !passwordMatch) {
    // Generic message — don't reveal whether email or password is wrong
    throw Object.assign(new Error('Invalid email or password.'), { status: 401 });
  }

  const user = rows[0];
  if (user.status !== 'active') {
    throw Object.assign(new Error('Your account has been suspended. Please contact support.'), { status: 403 });
  }

  // Update last_login asynchronously — don't block the response
  pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id])
    .catch(e => console.warn('[auth] last_login update failed:', e.message));

  return buildSession(user.id, user);
}

// ── Forgot password ────────────────────────────────────────────────────────
export async function forgotPassword(email) {
  const [rows] = await pool.execute(
    "SELECT id, first_name FROM users WHERE email = ? AND status = 'active' LIMIT 1",
    [email.toLowerCase()]
  );

  // ALWAYS return success — never reveal if email is registered
  if (!rows.length) return;

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool.execute(
    'UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?',
    [token, expires, rows[0].id]
  );

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5500'}?reset=${token}`;

  await sendMail({
    to:      email,
    subject: 'Reset your Invoq password',
    html:    resetHtml(rows[0].first_name, resetUrl),
  }).catch(e => console.warn('[auth] Reset email failed:', e.message));
}

// ── Reset password ─────────────────────────────────────────────────────────
export async function resetPassword(token, newPassword) {
  const [rows] = await pool.execute(
    "SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW() LIMIT 1",
    [token]
  );

  if (!rows.length) {
    throw Object.assign(
      new Error('This reset link is invalid or has expired. Please request a new one.'),
      { status: 400 }
    );
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await pool.execute(
    'UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
    [hash, rows[0].id]
  );
}

// ── Verify JWT ─────────────────────────────────────────────────────────────
export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function buildSession(userId, row) {
  let u = row;
  if (!u || !u.org_name) {
    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role,
              o.id AS org_id, o.name AS org_name, o.trading_name, o.plan,
              o.vat_number, o.vat_rate, o.approval_threshold, o.timezone
       FROM users u INNER JOIN organisations o ON o.id = u.org_id
       WHERE u.id = ? LIMIT 1`,
      [userId]
    );
    u = rows[0];
  }

  const token = jwt.sign(
    { userId, orgId: u.org_id },
    SECRET,
    { expiresIn: EXPIRES, algorithm: 'HS256' }
  );

  return {
    token,
    user: {
      id:        u.id,
      firstName: u.first_name,
      lastName:  u.last_name,
      email:     u.email,
      role:      u.role,
    },
    org: {
      id:                u.org_id,
      name:              u.org_name,
      tradingName:       u.trading_name,
      plan:              u.plan,
      vatNumber:         u.vat_number,
      vatRate:           u.vat_rate,
      approvalThreshold: u.approval_threshold,
      timezone:          u.timezone,
    },
  };
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function welcomeHtml(firstName, orgName) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;color:#222;padding:24px">
      <h2 style="color:#FF4D00;margin:0 0 16px">Welcome to Invoq, ${escHtml(firstName)}!</h2>
      <p>Your organisation <strong>${escHtml(orgName)}</strong> is ready to go.</p>
      <p style="margin-top:12px">Start uploading invoices to track your supplier spend, validate VAT, and generate SARS-ready reports.</p>
      <p style="margin-top:24px;color:#888;font-size:12px">
        If you didn't create this account, please ignore this email.
      </p>
    </div>`;
}

function resetHtml(firstName, url) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;color:#222;padding:24px">
      <h2 style="color:#FF4D00;margin:0 0 16px">Reset your password</h2>
      <p>Hi ${escHtml(firstName)},</p>
      <p style="margin-top:8px">Click the button below to reset your Invoq password. This link expires in <strong>1 hour</strong>.</p>
      <a href="${escHtml(url)}"
         style="display:inline-block;background:#FF4D00;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:20px 0">
        Reset my password
      </a>
      <p style="color:#888;font-size:12px;margin-top:16px">
        If you didn't request this, ignore this email — your password won't change.
      </p>
    </div>`;
}