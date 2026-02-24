import { Queue, Worker, Job } from 'bullmq';
import { createLogger } from '../lib/logger';

const log = createLogger('JobQueue');

// Redis connection config — prevent ioredis from auto-reconnecting and
// spamming ECONNREFUSED when no Redis server is available.
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null as null,
  retryStrategy: () => null as null,
  enableOfflineQueue: false,
  lazyConnect: true,
};

// ── Lazy-initialized queue (only created when initJobQueue is called) ──

let syncQueue: Queue | null = null;

function getQueue(): Queue {
  if (!syncQueue) throw new Error('Job queue not initialized — call initJobQueue() first');
  return syncQueue;
}

// ── Job types ────────────────────────────────────────────────

export type SyncJobName =
  | 'meta-ads-sync'
  | 'cc-poll'
  | 'cc-full-sync'
  | 'ga4-sync'
  | 'shopify-sync'
  | 'tiktok-sync'
  | 'klaviyo-sync'
  | 'creative-sync'
  | 'daily-reset'
  | 'oauth-refresh';

export interface SyncJobData {
  userId?: number;
  triggeredBy?: 'scheduler' | 'manual' | 'webhook';
}

// ── Worker setup ─────────────────────────────────────────────

let worker: Worker | null = null;

export function startSyncWorker(
  handler: (jobName: SyncJobName, data: SyncJobData) => Promise<void>,
): Worker {
  worker = new Worker(
    'sync-jobs',
    async (job: Job<SyncJobData>) => {
      const start = Date.now();
      log.info({ jobName: job.name, jobId: job.id, data: job.data }, `Starting job: ${job.name}`);

      try {
        await handler(job.name as SyncJobName, job.data);
        const durationMs = Date.now() - start;
        log.info({ jobName: job.name, jobId: job.id, durationMs }, `Job completed: ${job.name}`);
      } catch (err) {
        const durationMs = Date.now() - start;
        log.error({ jobName: job.name, jobId: job.id, durationMs, err }, `Job failed: ${job.name}`);
        throw err; // Let BullMQ handle retry
      }
    },
    {
      connection,
      concurrency: 2, // Process up to 2 jobs in parallel
      limiter: { max: 10, duration: 60_000 }, // Max 10 jobs per minute
    },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
      log.error(
        { jobName: job.name, jobId: job.id, attempts: job.attemptsMade, err },
        `Job permanently failed after ${job.attemptsMade} attempts: ${job.name}`,
      );
    }
  });

  return worker;
}

// ── Helper to enqueue jobs ───────────────────────────────────

export async function enqueueSync(
  jobName: SyncJobName,
  data: SyncJobData = {},
  options?: { delay?: number; priority?: number },
): Promise<void> {
  await getQueue().add(jobName, data, {
    ...options,
    jobId: data.userId ? `${jobName}-user-${data.userId}` : jobName,
  });
}

// ── Repeatable job schedules (mirrors cron from scheduler.ts) ─

export async function registerRepeatableJobs(): Promise<void> {
  const queue = getQueue();
  const jobs: { name: SyncJobName; pattern: string }[] = [
    { name: 'meta-ads-sync', pattern: '*/2 * * * *' },
    { name: 'cc-poll', pattern: '* * * * *' },
    { name: 'daily-reset', pattern: '0 * * * *' },
    { name: 'creative-sync', pattern: '5,35 * * * *' },
    { name: 'oauth-refresh', pattern: '0 */6 * * *' },
    { name: 'ga4-sync', pattern: '3,18,33,48 * * * *' },
    { name: 'cc-full-sync', pattern: '0 */4 * * *' },
    { name: 'shopify-sync', pattern: '30 */6 * * *' },
    { name: 'tiktok-sync', pattern: '*/2 * * * *' },
    { name: 'klaviyo-sync', pattern: '15 */2 * * *' },
  ];

  for (const { name, pattern } of jobs) {
    await queue.upsertJobScheduler(
      name,
      { pattern },
      { name, data: { triggeredBy: 'scheduler' } },
    );
  }

  log.info({ jobCount: jobs.length }, 'Repeatable jobs registered');
}

// ── Initialize the queue (call once at startup if Redis is available) ──

export async function initJobQueue(): Promise<boolean> {
  try {
    syncQueue = new Queue('sync-jobs', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    // Grab the underlying ioredis client and swallow unhandled errors
    // so they don't crash the process when Redis is unavailable.
    const client = await syncQueue.client;
    client.on('error', (err) => {
      log.debug({ err }, 'Redis connection error (suppressed)');
    });

    // Explicitly connect (required because lazyConnect is true)
    await client.connect();

    // Verify Redis connectivity with a ping
    await client.ping();
    log.info('BullMQ queue connected to Redis');
    return true;
  } catch (err) {
    log.warn({ err }, 'BullMQ unavailable — falling back to cron scheduler');
    syncQueue = null;
    return false;
  }
}

// ── Graceful shutdown ────────────────────────────────────────

export async function shutdownJobQueue(): Promise<void> {
  if (worker) {
    await worker.close();
  }
  if (syncQueue) {
    await syncQueue.close();
  }
}
