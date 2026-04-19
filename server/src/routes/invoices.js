import { Router } from 'express';
import { getInvoices, getStats } from '../services/invoiceService.js';

const router = Router();

/**
 * GET /api/invoices
 * Query params: status, page, limit, search
 */
router.get('/', async (req, res) => {
  const { status, page, limit, search } = req.query;

  const result = await getInvoices({
    status: status || undefined,
    page: page ? parseInt(page) : 1,
    limit: limit ? Math.min(parseInt(limit), 100) : 20,
    search: search || undefined,
  });

  res.json(result);
});

/**
 * GET /api/invoices/stats
 */
router.get('/stats', async (_req, res) => {
  const stats = await getStats();
  res.json(stats);
});

export default router;
