import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import ingestRoutes from './routes/ingest.js';
import invoiceRoutes from './routes/invoices.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security & logging ──────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://kamzamanyama.github.io/invoice-ingest/',
  methods: ['GET', 'POST'],
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));
app.use('/api/ingest', ingestRoutes);
app.use('/api/invoices', invoiceRoutes);

// ── Error handlers ──────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] ✓ Running on http://localhost:${PORT}`);
  console.log(`[server] DRY_RUN=${process.env.DRY_RUN || 'false'}`);
});

export default app;
