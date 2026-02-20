import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import metricsRouter from './routes/metrics';
import exportRouter from './routes/export';
import overridesRouter from './routes/overrides';
import webhooksRouter from './routes/webhooks';
import syncRouter from './routes/sync';
import settingsRouter from './routes/settings';
import { authMiddleware } from './middleware/auth';
import { startScheduler } from './services/scheduler';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// CORS: restrict to configured origin, fall back to same-origin in production
const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
app.use(cors({
  origin: allowedOrigin
    ? allowedOrigin.split(',').map((o) => o.trim())
    : process.env.NODE_ENV === 'production'
      ? false  // same-origin only in production
      : true,  // allow all in development
  credentials: true,
}));
// Capture raw body buffer for webhook HMAC verification
app.use(express.json({
  limit: '1mb',
  verify: (req: express.Request, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Too many webhook requests' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts' },
});

// Apply rate limiters before routes
app.use('/api/webhooks', webhookLimiter);
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Health check (no auth)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhooks use their own auth (signature verification), mount before general auth
app.use('/api/webhooks', webhooksRouter);

// Apply auth middleware to all other /api routes
app.use('/api', authMiddleware);

app.use('/api/metrics', metricsRouter);
app.use('/api/export', exportRouter);
app.use('/api/overrides', overridesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/settings', settingsRouter);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ATS Server] Running on port ${PORT}`);
  startScheduler();
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[ATS Server] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('[ATS Server] HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => {
    console.error('[ATS Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
