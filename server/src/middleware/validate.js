/**
 * Input validation & sanitisation — OWASP A03 (Injection)
 *
 * Uses express-validator for declarative validation chains.
 * Uses xss library to strip HTML/script tags from string fields.
 *
 * Pattern:
 *   router.post('/route', validate.signupRules, validate.check, handler)
 *
 * All string inputs are:
 *   1. Trimmed
 *   2. XSS-sanitised (HTML stripped)
 *   3. Length-bounded
 *   4. Type-checked
 */
import { body, validationResult } from 'express-validator';
import xss                         from 'xss';

// ── Respond with first validation error ────────────────────────────────────
export function check(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(422).json({ error: first.msg });
  }
  next();
}

// ── Sanitise a string: trim + strip XSS ───────────────────────────────────
const clean = val => xss(String(val ?? '').trim(), { whiteList: {}, stripIgnoreTag: true });

// ── Validation rule sets ───────────────────────────────────────────────────

export const signupRules = [
  body('firstName')
    .trim().notEmpty().withMessage('First name is required.')
    .isLength({ max: 100 }).withMessage('First name must be under 100 characters.')
    .customSanitizer(clean),

  body('lastName')
    .trim().optional({ checkFalsy: true })
    .isLength({ max: 100 }).withMessage('Last name must be under 100 characters.')
    .customSanitizer(clean),

  body('orgName')
    .trim().notEmpty().withMessage('Business name is required.')
    .isLength({ min: 2, max: 255 }).withMessage('Business name must be 2–255 characters.')
    .customSanitizer(clean),

  body('email')
    .trim().notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email must be under 255 characters.'),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .isLength({ max: 128 }).withMessage('Password must be under 128 characters.'),
];

export const loginRules = [
  body('email')
    .trim().notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ max: 128 }).withMessage('Invalid password.'),
];

export const forgotPasswordRules = [
  body('email')
    .trim().notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),
];

export const resetPasswordRules = [
  body('token')
    .trim().notEmpty().withMessage('Reset token is required.')
    .isLength({ max: 255 }).withMessage('Invalid token.'),

  body('password')
    .notEmpty().withMessage('New password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .isLength({ max: 128 }).withMessage('Password must be under 128 characters.'),
];

export const supplierRules = [
  body('supplier_number')
    .trim().notEmpty().withMessage('Supplier number is required.')
    .isLength({ max: 255 }).withMessage('Supplier number must be under 255 characters.')
    .customSanitizer(clean),

  body('supplier_name')
    .trim().notEmpty().withMessage('Supplier name is required.')
    .isLength({ max: 255 }).withMessage('Supplier name must be under 255 characters.')
    .customSanitizer(clean),

  body('cipc_number')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 }).withMessage('CIPC number must be under 30 characters.')
    .matches(/^[A-Za-z0-9/\-]+$/).withMessage('CIPC number contains invalid characters.')
    .customSanitizer(clean),

  body('vat_number')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('VAT number must be under 20 characters.')
    .matches(/^[0-9]+$/).withMessage('VAT number must contain only digits.')
    .customSanitizer(clean),

  body('bee_level')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['1','2','3','4','5','6','7','8','exempt','']).withMessage('Invalid BEE level.'),

  body('contact_email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please enter a valid contact email.')
    .normalizeEmail(),
];

export const inviteRules = [
  body('email')
    .trim().notEmpty().withMessage('Email address is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('role')
    .trim().notEmpty().withMessage('Role is required.')
    .isIn(['viewer','finance_manager','approver','admin']).withMessage('Invalid role.'),
];

export const settingsRules = [
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Organisation name must be 2–255 characters.')
    .customSanitizer(clean),

  body('tradingName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Trading name must be under 255 characters.')
    .customSanitizer(clean),

  body('vatNumber')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{10}$/).withMessage('VAT number must be exactly 10 digits.'),

  body('vatRate')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 }).withMessage('VAT rate must be between 0 and 100.'),

  body('approvalThreshold')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Approval threshold must be a positive number.'),
];