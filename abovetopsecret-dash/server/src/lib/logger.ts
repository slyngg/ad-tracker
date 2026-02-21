import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: 'ats-server' },
});

export default logger;

/** Create a child logger with a fixed context label (replaces console.log('[Label]', ...)) */
export function createLogger(context: string) {
  return logger.child({ context });
}
