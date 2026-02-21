import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import metricsRouter from './routes/metrics';
import exportRouter from './routes/export';
import overridesRouter from './routes/overrides';
import webhooksRouter from './routes/webhooks';
import syncRouter from './routes/sync';
import settingsRouter from './routes/settings';
import authRouter from './routes/auth';
import analyticsRouter from './routes/analytics';
import costsRouter from './routes/costs';
import notificationsRouter from './routes/notifications';
import operatorRouter from './routes/operator';
import rulesRouter from './routes/rules';
import sqlBuilderRouter from './routes/sql-builder';
import apiKeysRouter from './routes/api-keys';
import uploadRouter from './routes/upload';
import webhookTokensRouter from './routes/webhook-tokens';
import pixelConfigsRouter from './routes/pixel-configs';
import ga4Router from './routes/ga4';
import favoritesRouter from './routes/favorites';
import attributionModelsRouter from './routes/attribution-models';
import rfmRouter from './routes/rfm';
import creativeRouter from './routes/creative';
import repeatPurchasesRouter from './routes/repeat-purchases';
import teamRouter from './routes/team';
import scheduledReportsRouter from './routes/scheduled-reports';
import brandVaultRouter from './routes/brand-vault';
import globalFiltersRouter from './routes/global-filters';
import integrationsConfigRouter from './routes/integrations-config';
import oauthRouter from './routes/oauth';
import dataDeletionRouter from './routes/data-deletion';
import dataDictionaryRouter from './routes/data-dictionary';
import onboardingRouter from './routes/onboarding';
import workspacesRouter from './routes/workspaces';
import aiAgentsRouter from './routes/ai-agents';
import reportBuilderRouter from './routes/report-builder';
import creativeGenRouter from './routes/creative-gen';
import creativesRouter from './routes/creatives';
import accountsRouter from './routes/accounts';
import brandConfigsRouter from './routes/brand-configs';
import campaignsRouter from './routes/campaigns';
import templatesRouter from './routes/templates';
import adLibraryRouter from './routes/ad-library';
import healthRouter from './routes/health';
import { authMiddleware } from './middleware/auth';
import { startScheduler } from './services/scheduler';
import { initJobQueue, shutdownJobQueue, registerRepeatableJobs, startSyncWorker } from './services/job-queue';
import { initRealtime } from './services/realtime';
import { initSlackBot } from './services/slack-bot';
import pool from './db';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// CORS: restrict to configured origin, fall back to same-origin
const allowedOrigin = process.env.ALLOWED_ORIGIN || '';
app.use(cors({
  origin: allowedOrigin
    ? allowedOrigin.split(',').map((o) => o.trim())
    : process.env.NODE_ENV === 'production'
      ? false  // same-origin only in production
      : ['http://localhost:5173', 'http://localhost:4000', 'http://127.0.0.1:5173'],
  credentials: true,
}));
// Capture raw body buffer for webhook HMAC verification
app.use(express.json({
  limit: '5mb',
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

// Health check (no auth for basic, auth for data checks)
app.use('/api/health', healthRouter);

// Auth routes (no auth middleware needed - they handle their own auth)
app.use('/api/auth', authRouter);

// Webhooks use their own auth (signature verification), mount before general auth
app.use('/api/webhooks', webhooksRouter);

// OAuth routes handle auth per-endpoint (callback is public, others require JWT)
app.use('/api/oauth', oauthRouter);

// Public snapshot endpoint (no auth required — uses token-based access)
app.get('/api/creatives/public/snapshot/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await pool.query(
      'SELECT * FROM report_snapshots WHERE snapshot_token = $1',
      [token]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    const snapshot = result.rows[0];
    if (snapshot.expires_at && new Date(snapshot.expires_at) < new Date()) {
      res.status(410).json({ error: 'Snapshot has expired' }); return;
    }
    if (snapshot.snapshot_data) {
      res.json({ title: snapshot.title, report_type: snapshot.report_type, data: snapshot.snapshot_data, created_at: snapshot.created_at });
    } else {
      res.json({ title: snapshot.title, report_type: snapshot.report_type, config: snapshot.report_config, is_live: snapshot.is_live, created_at: snapshot.created_at });
    }
  } catch (err) {
    console.error('Error fetching public snapshot:', err);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// Apply auth middleware to all other /api routes
app.use('/api', authMiddleware);

// Authenticated routes
app.use('/api/metrics', metricsRouter);
app.use('/api/export', exportRouter);
app.use('/api/overrides', overridesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/costs', costsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/operator', operatorRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/sql', sqlBuilderRouter);
app.use('/api/keys', apiKeysRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/webhook-tokens', webhookTokensRouter);
app.use('/api/pixel-configs', pixelConfigsRouter);
app.use('/api/ga4', ga4Router);
app.use('/api/favorites', favoritesRouter);
app.use('/api/attribution-models', attributionModelsRouter);
app.use('/api/rfm', rfmRouter);
app.use('/api/creative', creativeRouter);
app.use('/api/repeat-purchases', repeatPurchasesRouter);
app.use('/api/team', teamRouter);
app.use('/api/scheduled-reports', scheduledReportsRouter);
app.use('/api/brand-vault', brandVaultRouter);
app.use('/api/global-filters', globalFiltersRouter);
app.use('/api/integrations-config', integrationsConfigRouter);
app.use('/api/data-deletion', dataDeletionRouter);
app.use('/api/data-dictionary', dataDictionaryRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/agents', aiAgentsRouter);
app.use('/api/reports', reportBuilderRouter);
app.use('/api/creative-gen', creativeGenRouter);
app.use('/api/creatives', creativesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/brand-configs', brandConfigsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/ad-library', adLibraryRouter);

const httpServer = createServer(app);

// Initialize WebSocket realtime layer
initRealtime(httpServer, pool);

const server = httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`[ATS Server] Running on port ${PORT}`);

  // Try BullMQ first; fall back to cron scheduler if Redis is unavailable
  const bullmqReady = await initJobQueue();
  if (bullmqReady) {
    await registerRepeatableJobs();
    startSyncWorker(async (_jobName, _data) => {
      // Job handler delegates to the same sync functions as the cron scheduler.
      // Full handler mapping will be wired once BullMQ is the primary scheduler.
      // For now, repeatable jobs are registered so the queue is ready for manual enqueue.
    });
    console.log('[ATS Server] BullMQ job queue active');
  }

  // Always start the cron scheduler (primary scheduler until BullMQ migration is complete)
  startScheduler();
  initSlackBot();
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[ATS Server] ${signal} received, shutting down gracefully...`);
  shutdownJobQueue().catch(() => {}); // Best-effort BullMQ cleanup
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
