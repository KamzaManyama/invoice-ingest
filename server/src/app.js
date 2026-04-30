/**
 * Invoq — Express application entry point
 *
 * Startup order:
 *  1. Load env vars (dotenv)
 *  2. Create Express app
 *  3. Apply security middleware (helmet, cors)
 *  4. Apply rate limiters
 *  5. Mount API router
 *  6. Register error handlers
 *  7. Start HTTP server
 */
import 'express-async-errors';
import express   from 'express';
import helmet    from 'helmet';
import cors      from 'cors';
import morgan    from 'morgan';
import dotenv    from 'dotenv';

dotenv.config();

import apiRouter             from './index.js';
import { authLimiter, uploadLimiter, apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler }           from './middleware/errorHandler.js';

const app  = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Request parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── HTTP logging ────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Rate limiting ───────────────────────────────────────────────────────────
app.use('/api/auth',   authLimiter);
app.use('/api/ingest', uploadLimiter);
app.use('/api',        apiLimiter);

// ── Health check (no auth, no rate limit) ───────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── API routes ──────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── 404 + global error handler ──────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] ✓ Listening on port ${PORT}  (${process.env.NODE_ENV || 'development'})`);
});

export default app;
