import { parseCsvBuffer, computeHash } from '../utils/csvParser.js';
import { validateRow }                 from './validator.js';
import { isDuplicate, insertInvoice, recordFailure } from './invoiceService.js';
import { sendIngestAlert }             from './emailService.js';
import { audit }                       from './auditService.js';

const MYSQL_DUP = 'ER_DUP_ENTRY';

export async function runIngestPipeline(ctx, fileBuffer, fileName, dryRun=false, source='upload') {
  const { orgId, org, user, req } = ctx;
  const startedAt  = Date.now();
  const sourceHash = computeHash(fileBuffer);

  let rows;
  try { rows = await parseCsvBuffer(fileBuffer); }
  catch(err) { throw new Error(`CSV parse error: ${err.message}`); }

  const metrics = { processed: rows.length, inserted:0, duplicates:0, failed:0, pending:0 };
  const results = [];
  const errors  = [];

  for (const [i, raw] of rows.entries()) {
    const rowNum = i + 2;
    const { valid, record, notes } = validateRow(raw);

    if (!valid) {
      const reason = notes.join('; ');
      metrics.failed++;
      results.push(mk(rowNum, raw, 'failed', reason));
      errors.push({ invoice_number: raw.invoice_number??'—', supplier_number: raw.supplier_number??'—', reason });
      if (!dryRun) await recordFailure(orgId, raw, reason, fileName, sourceHash);
      continue;
    }

    let dup = false;
    try { dup = await isDuplicate(orgId, record.supplier_number, record.invoice_number); }
    catch(e) { console.error(`[pipeline] dedup row ${rowNum}:`, e.message); }

    if (dup) {
      metrics.duplicates++;
      results.push(mk(rowNum, record, 'duplicate', 'Already exists in your records.'));
      continue;
    }

    if (dryRun) {
      metrics.inserted++;
      results.push(mk(rowNum, record, 'inserted', '[DRY-RUN] Not saved.'));
      continue;
    }

    const needsApproval = org?.approvalThreshold &&
      Number(record.amount_incl_vat) >= Number(org.approvalThreshold);

    try {
      const { status } = await insertInvoice(orgId, record, fileName, sourceHash, user?.id, needsApproval);
      if (status === 'pending') {
        metrics.pending++;
        results.push(mk(rowNum, record, 'pending', `Requires approval (above R${Number(org.approvalThreshold).toLocaleString('en-ZA')})`));
      } else {
        metrics.inserted++;
        results.push(mk(rowNum, record, 'inserted', null));
      }
    } catch(err) {
      if (err.code === MYSQL_DUP) {
        metrics.duplicates++;
        results.push(mk(rowNum, record, 'duplicate', 'Duplicate (race condition).'));
      } else {
        const reason = `Save error: ${err.message}`;
        metrics.failed++;
        results.push(mk(rowNum, record, 'failed', reason));
        errors.push({ invoice_number: record.invoice_number, supplier_number: record.supplier_number, reason });
      }
    }
  }

  const duration = Date.now() - startedAt;

  audit({ orgId, user, req, eventType:'upload',
    detail:`${fileName}: ${metrics.processed} rows — ${metrics.inserted} inserted, ${metrics.duplicates} dup, ${metrics.failed} failed${dryRun?' [DRY-RUN]':''}` });

  sendIngestAlert({ orgName: org?.name, userEmail: user?.email, fileName, ...metrics, errors, dryRun, source })
    .catch(e => console.error('[pipeline] email:', e.message));

  return { fileName, sourceHash, dryRun, source, duration, metrics, results };
}

function mk(row, data, status, note) {
  return { row, invoice_number: data.invoice_number??'—', supplier_number: data.supplier_number??'—', status, validation_notes: note??null };
}