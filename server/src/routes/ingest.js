/**
 * POST /api/ingest
 *
 * Trigger source A: Manual UI upload — user selects a file in the dashboard.
 * Trigger source B: Webhook — external system POSTs the CSV programmatically.
 *
 * Optional query params:
 *   ?dryRun=true     skip DB writes, flag results as dry-run
 *   ?source=webhook  label the run in metrics + alert email
 */
import { Router } from 'express';
import { handleUpload } from '../middleware/upload.js';
import { runIngestPipeline } from '../services/ingestPipeline.js';

const router = Router();

router.post('/', async (req, res) => {
  await handleUpload(req, res);

  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded. Send a multipart/form-data POST with field name "file".',
    });
  }

  const dryRun = req.query.dryRun === 'true' || process.env.DRY_RUN === 'true';
  const source = req.query.source === 'webhook' ? 'webhook' : 'upload';

  const result = await runIngestPipeline(
    req.file.buffer,
    req.file.originalname,
    dryRun,
    source
  );

  res.status(200).json(result);
});

export default router;
