/**
 * Validation & normalisation service for supplier invoices.
 *
 * Business rules enforced:
 *  1. Required fields present.
 *  2. Amounts are valid numbers.
 *  3. VAT defaults to 15% (SA) when not supplied; flags mismatch if given.
 *  4. amount_incl_vat is derived when missing; checked otherwise (±0.01).
 *  5. invoice_date is not in the future (Africa/Johannesburg).
 *  6. invoice_date must be a valid calendar date.
 */

const TIMEZONE = process.env.TIMEZONE || 'Africa/Johannesburg';
const DEFAULT_VAT_RATE = 15;
const VAT_TOLERANCE = 0.01;
const AMOUNT_TOLERANCE = 0.01;

const REQUIRED_FIELDS = [
  'supplier_number',
  'supplier_name',
  'invoice_number',
  'department',
  'invoice_date',
  'amount_excl',
];

/**
 * Round a number to 2 decimal places using "round half away from zero".
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Get the current date string in YYYY-MM-DD for the configured timezone.
 * @returns {string}
 */
function todayInJhb() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Validate and normalise a single raw CSV row.
 *
 * @param {object} raw - raw row from CSV parser (lowercased keys)
 * @returns {{ valid: boolean, record: object|null, notes: string[] }}
 */
export function validateRow(raw) {
  const notes = [];

  // ── 1. Required fields ───────────────────────────────────────────────────
  for (const field of REQUIRED_FIELDS) {
    if (!raw[field] || String(raw[field]).trim() === '') {
      notes.push(`Missing required field: ${field}`);
    }
  }

  if (notes.length > 0) {
    return { valid: false, record: null, notes };
  }

  // ── 2. Parse amounts ──────────────────────────────────────────────────────
  const amountExcl = parseFloat(raw['amount_excl']);
  if (isNaN(amountExcl) || amountExcl < 0) {
    notes.push(`Invalid amount_excl: "${raw['amount_excl']}"`);
  }

  // ── 3. Resolve VAT ────────────────────────────────────────────────────────
  let vatRate = DEFAULT_VAT_RATE;
  let computedVat;
  let givenVat;
  let givenAmountIncl;

  if (raw['vat_rate'] !== undefined && raw['vat_rate'] !== '') {
    vatRate = parseFloat(raw['vat_rate']);
    if (isNaN(vatRate) || vatRate < 0) {
      notes.push(`Invalid vat_rate: "${raw['vat_rate']}"`);
      vatRate = DEFAULT_VAT_RATE;
    }
  }

  if (!isNaN(amountExcl)) {
    computedVat = round2(amountExcl * (vatRate / 100));
  }

  if (raw['vat'] !== undefined && raw['vat'] !== '') {
    givenVat = parseFloat(raw['vat']);
    if (isNaN(givenVat)) {
      notes.push(`Invalid vat value: "${raw['vat']}"`);
    } else if (computedVat !== undefined && Math.abs(givenVat - computedVat) > VAT_TOLERANCE) {
      notes.push(
        `VAT mismatch: given ${givenVat.toFixed(2)}, expected ${computedVat.toFixed(2)} at ${vatRate}%`
      );
    }
  }

  const resolvedVat = givenVat !== undefined && !isNaN(givenVat) ? givenVat : computedVat ?? 0;

  // ── 4. Resolve amount_incl_vat ────────────────────────────────────────────
  if (raw['amount_incl'] !== undefined && raw['amount_incl'] !== '') {
    givenAmountIncl = parseFloat(raw['amount_incl']);
    if (isNaN(givenAmountIncl)) {
      notes.push(`Invalid amount_incl: "${raw['amount_incl']}"`);
    }
  }

  const derivedAmountIncl = !isNaN(amountExcl) ? round2(amountExcl + resolvedVat) : null;

  let resolvedAmountIncl;
  if (givenAmountIncl !== undefined && !isNaN(givenAmountIncl)) {
    if (
      derivedAmountIncl !== null &&
      Math.abs(givenAmountIncl - derivedAmountIncl) > AMOUNT_TOLERANCE
    ) {
      notes.push(
        `amount_incl_vat mismatch: given ${givenAmountIncl.toFixed(2)}, derived ${derivedAmountIncl.toFixed(2)}`
      );
    }
    resolvedAmountIncl = givenAmountIncl;
  } else {
    resolvedAmountIncl = derivedAmountIncl;
  }

  // ── 5. Validate invoice_date ──────────────────────────────────────────────
  const rawDate = String(raw['invoice_date']).trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  let invoiceDateValid = true;

  if (!dateRegex.test(rawDate)) {
    notes.push(`invoice_date must be YYYY-MM-DD, got: "${rawDate}"`);
    invoiceDateValid = false;
  } else {
    const today = todayInJhb();
    if (rawDate > today) {
      notes.push(`invoice_date is in the future: ${rawDate} (today: ${today} ${TIMEZONE})`);
      invoiceDateValid = false;
    }
  }

  // ── 6. Final validity ─────────────────────────────────────────────────────
  if (notes.length > 0) {
    return { valid: false, record: null, notes };
  }

  const record = {
    invoice_number:   String(raw['invoice_number']).trim(),
    supplier_number:  String(raw['supplier_number']).trim(),
    supplier_name:    String(raw['supplier_name']).trim(),
    department:       String(raw['department']).trim(),
    amount_excl_vat:  round2(amountExcl),
    vat:              round2(resolvedVat),
    amount_incl_vat:  round2(resolvedAmountIncl),
    invoice_date:     rawDate,
  };

  return { valid: true, record, notes: [] };
}
