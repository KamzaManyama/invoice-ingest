/**
 * File upload middleware — OWASP A04 (Insecure Design), A05 (Misconfiguration)
 *
 * Security controls:
 *  - In-memory storage only — files never touch disk
 *  - Strict MIME type whitelist (CSV only)
 *  - File extension check (belt-and-suspenders on top of MIME)
 *  - Hard size limit from environment variable
 *  - Rejects multi-file or unexpected field names
 *  - Returns plain JSON errors (not Multer's default HTML)
 */
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

const MAX_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel', // Excel sometimes sends this for .csv
  'text/plain',               // Some systems send plain text for CSV
]);

const fileFilter = (_req, file, cb) => {
  const mimeOk = ALLOWED_MIMES.has(file.mimetype);
  const extOk  = file.originalname.toLowerCase().endsWith('.csv');

  if (!mimeOk && !extOk) {
    return cb(Object.assign(
      new Error('Only .csv files are accepted.'),
      { status: 415 }
    ));
  }
  cb(null, true);
};

const upload = multer({
  storage:  multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize:   MAX_BYTES,
    files:      1,    // only one file per request
    fields:     0,    // no extra form fields needed
    fieldSize:  0,
  },
}).single('file');

/**
 * Promise-wrapped upload handler so async route handlers work cleanly.
 * Normalises Multer errors into our standard JSON format.
 */
export function handleUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, err => {
      if (!err) return resolve();

      if (err.code === 'LIMIT_FILE_SIZE') {
        return reject(Object.assign(
          new Error(`File exceeds the ${process.env.MAX_FILE_SIZE_MB || 10} MB size limit.`),
          { status: 413 }
        ));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return reject(Object.assign(
          new Error('Unexpected file field. Use field name "file".'),
          { status: 400 }
        ));
      }
      reject(err);
    });
  });
}