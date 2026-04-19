import { parse } from 'csv-parse';
import crypto from 'crypto';

/**
 * Compute SHA-256 hash of a Buffer or string.
 * @param {Buffer|string} data
 * @returns {string} hex digest
 */
export function computeHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Parse a CSV buffer into an array of raw row objects.
 * Trims all string values and normalises header names.
 *
 * @param {Buffer} buffer
 * @returns {Promise<object[]>}
 */
export async function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    parse(buffer, {
      columns: (headers) =>
        headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_')),
      skip_empty_lines: true,
      trim: true,
      comment: '#',  // ignore inline comments in sample CSV
    }, (err, records) => {
      if (err) return reject(err);
      resolve(records);
    });
  });
}
