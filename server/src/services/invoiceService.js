/**
 * Invoice persistence service.
 * All queries use mysql2's pool.execute() for prepared statements.
 * mysql2 returns [rows, fields] — we always destructure accordingly.
 */
import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Check if an invoice already exists by (supplier_number, invoice_number).
 * @returns {Promise<boolean>}
 */
export async function isDuplicate(supplierNumber, invoiceNumber) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM supplier_invoices
     WHERE supplier_number = ? AND invoice_number = ?
     LIMIT 1`,
    [supplierNumber, invoiceNumber]
  );
  return rows.length > 0;
}

/**
 * Insert a validated, normalised invoice record.
 * @returns {Promise<object>} the inserted record
 */
export async function insertInvoice(record, sourceFile, sourceHash, dryRun = false) {
  const table = dryRun ? 'supplier_invoices_staging' : 'supplier_invoices';
  const id = uuidv4();

  await pool.execute(
    `INSERT INTO ${table}
       (id, invoice_number, supplier_number, supplier_name, department,
        amount_excl_vat, vat, amount_incl_vat, invoice_date,
        source_file_name, source_hash, status, validation_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inserted', NULL)`,
    [
      id,
      record.invoice_number,
      record.supplier_number,
      record.supplier_name,
      record.department,
      record.amount_excl_vat,
      record.vat,
      record.amount_incl_vat,
      record.invoice_date,
      sourceFile,
      sourceHash,
    ]
  );

  return { id, ...record, source_file_name: sourceFile, source_hash: sourceHash, status: 'inserted' };
}

/**
 * Record a failed row in supplier_invoices_failures for retry tracking.
 */
export async function recordFailure(rawRow, errorMessage, sourceFile, sourceHash) {
  await pool.execute(
    `INSERT INTO supplier_invoices_failures
       (id, source_file_name, source_hash, raw_row, error_message)
     VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), sourceFile, sourceHash, JSON.stringify(rawRow), errorMessage]
  );
}

/**
 * Paginated invoice list with optional status + full-text search filters.
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function getInvoices({ status, page = 1, limit = 20, search } = {}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(invoice_number LIKE ? OR supplier_name LIKE ? OR supplier_number LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT * FROM supplier_invoices ${where}
     ORDER BY ingest_timestamp DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM supplier_invoices ${where}`,
    params
  );

  return { rows, total: countRows[0].total };
}

/**
 * Aggregate counts by status.
 */
export async function getStats() {
  const [rows] = await pool.execute(`
    SELECT
      COUNT(*)                                              AS total,
      SUM(status = 'inserted')                             AS inserted,
      SUM(status = 'duplicate')                            AS duplicate,
      SUM(status = 'failed')                               AS failed
    FROM supplier_invoices
  `);
  return rows[0];
}

/**
 * Read / write Gmail history ID for incremental polling.
 */
export async function getGmailHistoryId() {
  const [rows] = await pool.execute(
    'SELECT history_id FROM gmail_poll_state WHERE id = 1'
  );
  return rows[0]?.history_id ?? 0;
}

export async function setGmailHistoryId(historyId) {
  await pool.execute(
    'UPDATE gmail_poll_state SET history_id = ? WHERE id = 1',
    [historyId]
  );
}
