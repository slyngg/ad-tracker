import express from 'express';
import cors from 'cors';
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

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ATS Server] Running on port ${PORT}`);
  startScheduler();
});
