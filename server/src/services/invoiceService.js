import pool           from '../config/db.js';
import { v4 as uuid } from 'uuid';

export async function isDuplicate(orgId, supplierNumber, invoiceNumber) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM supplier_invoices WHERE org_id=? AND supplier_number=? AND invoice_number=? LIMIT 1`,
    [orgId, supplierNumber, invoiceNumber]
  );
  return rows.length > 0;
}

export async function insertInvoice(orgId, record, sourceFile, sourceHash, uploadedBy, requiresApproval) {
  const id     = uuid();
  const status = requiresApproval ? 'pending' : 'inserted';
  await pool.execute(
    `INSERT INTO supplier_invoices
       (id,org_id,invoice_number,supplier_number,supplier_name,department,
        amount_excl_vat,vat,amount_incl_vat,invoice_date,
        source_file_name,source_hash,uploaded_by,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id,orgId,record.invoice_number,record.supplier_number,record.supplier_name,
     record.department,record.amount_excl_vat,record.vat,record.amount_incl_vat,
     record.invoice_date,sourceFile,sourceHash,uploadedBy||null,status]
  );
  return { id, status };
}

export async function recordFailure(orgId, rawRow, errorMessage, sourceFile, sourceHash) {
  await pool.execute(
    `INSERT INTO supplier_invoices_failures (id,org_id,source_file_name,source_hash,raw_row,error_message)
     VALUES (?,?,?,?,?,?)`,
    [uuid(),orgId,sourceFile,sourceHash,JSON.stringify(rawRow),errorMessage]
  ).catch(e => console.warn('[invoice] recordFailure:', e.message));
}

export async function getInvoices(orgId, { status, search, department, from, to, page=1, limit=20 }={}) {
  const offset = (page-1)*limit;
  const conds  = ['org_id=?'];
  const params = [orgId];
  if (status)     { conds.push('status=?'); params.push(status); }
  if (department) { conds.push('department=?'); params.push(department); }
  if (search)     { conds.push('(invoice_number LIKE ? OR supplier_name LIKE ? OR supplier_number LIKE ?)'); const l=`%${search}%`; params.push(l,l,l); }
  if (from)       { conds.push('invoice_date>=?'); params.push(from); }
  if (to)         { conds.push('invoice_date<=?'); params.push(to); }
  const where = `WHERE ${conds.join(' AND ')}`;
  const [rows]  = await pool.execute(`SELECT * FROM supplier_invoices ${where} ORDER BY ingest_timestamp DESC LIMIT ? OFFSET ?`, [...params,limit,offset]);
  const [cnt]   = await pool.execute(`SELECT COUNT(*) AS total FROM supplier_invoices ${where}`, params);
  return { rows, total: cnt[0].total };
}

export async function getStats(orgId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total,
            SUM(status IN ('inserted','approved')) AS inserted,
            SUM(status='duplicate') AS duplicate,
            SUM(status='failed') AS failed,
            SUM(status='pending') AS pending
     FROM supplier_invoices WHERE org_id=?`, [orgId]
  );
  return rows[0];
}

export async function approveInvoice(orgId, id, userId) {
  const [r] = await pool.execute(
    `UPDATE supplier_invoices SET status='approved',approved_by=?,approved_at=NOW()
     WHERE id=? AND org_id=? AND status='pending'`, [userId,id,orgId]
  );
  if (!r.affectedRows) throw Object.assign(new Error('Invoice not found or not pending.'),{status:404});
}

export async function rejectInvoice(orgId, id) {
  const [r] = await pool.execute(
    `UPDATE supplier_invoices SET status='rejected' WHERE id=? AND org_id=? AND status='pending'`,[id,orgId]
  );
  if (!r.affectedRows) throw Object.assign(new Error('Invoice not found or not pending.'),{status:404});
}

export async function getGmailHistoryId(orgId) {
  const [rows] = await pool.execute('SELECT history_id FROM gmail_poll_state WHERE org_id=? LIMIT 1',[orgId]);
  return rows[0]?.history_id ?? 0;
}
export async function setGmailHistoryId(orgId, historyId) {
  await pool.execute('UPDATE gmail_poll_state SET history_id=? WHERE org_id=?',[historyId,orgId]);
}