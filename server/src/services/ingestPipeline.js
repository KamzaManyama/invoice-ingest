/**
 * Core ingest orchestration pipeline.
 * Accepts a CSV buffer + metadata, runs all stages, returns a summary.
 *
 * Stages:
 *  1. Hash   → idempotency
 *  2. Parse  → raw rows
 *  3. Validate → normalised record or rejection notes
 *  4. Dedup  → skip existing (supplier_number, invoice_number) pairs
 *  5. Insert → write to DB (or dry-run skip)
 *  6. Alert  → fire-and-forget email summary
 */
import { parseCsvBuffer, computeHash } from '../utils/csvParser.js';
import { validateRow } from './validator.js';
import { isDuplicate, insertInvoice, recordFailure } from './invoiceService.js';
import { sendIngestAlert } from './emailService.js';

const MYSQL_DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

/**
 * @param {Buffer}  fileBuffer
 * @param {string}  fileName
 * @param {boolean} dryRun
 * @param {string}  [source]   - 'upload' | 'gmail' | 'webhook'
 * @returns {Promise<object>}
 */
export async function runIngestPipeline(fileBuffer, fileName, dryRun = false, source = 'upload') {
  const startedAt = Date.now();
  const sourceHash = computeHash(fileBuffer);

  // ── 1. Parse ──────────────────────────────────────────────────────────────
  let rows;
  try {
    rows = await parseCsvBuffer(fileBuffer);
  } catch (err) {
    throw new Error(`CSV parse error: ${err.message}`);
  }

  const metrics = { processed: rows.length, inserted: 0, duplicates: 0, failed: 0 };
  const results = [];
  const errorDetails = [];

  // ── 2. Row-wise processing ────────────────────────────────────────────────
  for (const [index, raw] of rows.entries()) {
    const rowNum = index + 2; // account for header row

    // Validate & normalise
    const { valid, record, notes } = validateRow(raw);

    if (!valid) {
      const reason = notes.join('; ');
      metrics.failed++;
      results.push(makeResult(rowNum, raw, 'failed', reason));
      errorDetails.push({ invoice_number: raw.invoice_number ?? '—', supplier_number: raw.supplier_number ?? '—', reason });
      recordFailure(raw, reason, fileName, sourceHash).catch((e) =>
        console.warn(`[pipeline] recordFailure row ${rowNum}:`, e.message)
      );
      continue;
    }

    // Dedup check
    let dup = false;
    try {
      dup = await isDuplicate(record.supplier_number, record.invoice_number);
    } catch (err) {
      console.error(`[pipeline] Dedup query failed row ${rowNum}:`, err.message);
    }

    if (dup) {
      metrics.duplicates++;
      results.push(makeResult(rowNum, record, 'duplicate',
        'Duplicate: (supplier_number, invoice_number) already exists.'));
      continue;
    }

    // Insert
    if (dryRun) {
      metrics.inserted++;
      results.push(makeResult(rowNum, record, 'inserted', '[DRY-RUN] Not written to DB.'));
      continue;
    }

    try {
      await insertInvoice(record, fileName, sourceHash, false);
      metrics.inserted++;
      results.push(makeResult(rowNum, record, 'inserted', null));
    } catch (err) {
      if (err.code === MYSQL_DUPLICATE_ENTRY) {
        metrics.duplicates++;
        results.push(makeResult(rowNum, record, 'duplicate', 'Duplicate detected on insert (race condition).'));
      } else {
        const reason = `DB insert error: ${err.message}`;
        metrics.failed++;
        results.push(makeResult(rowNum, record, 'failed', reason));
        errorDetails.push({ invoice_number: record.invoice_number, supplier_number: record.supplier_number, reason });
      }
    }
  }

  const duration = Date.now() - startedAt;

  // ── 3. Alert (fire-and-forget) ────────────────────────────────────────────
  sendIngestAlert({ fileName, ...metrics, errors: errorDetails, dryRun, source })
    .catch((err) => console.error('[pipeline] Email alert failed:', err.message));

  return { fileName, sourceHash, dryRun, source, duration, metrics, results };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function makeResult(row, data, status, note) {
  return {
    row,
    invoice_number:  data.invoice_number  ?? '—',
    supplier_number: data.supplier_number ?? '—',
    status,
    validation_notes: note ?? null,
  };
}
