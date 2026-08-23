import config from './config.js';
import { createApp } from './app.js';
import { Scheduler } from './monitors/scheduler.js';
import { logger } from './logger.js';

const app = createApp();
const scheduler = new Scheduler();

const server = app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, env: config.env, db: config.dbFile });
  scheduler.start();
});

function shutdown(signal) {
  logger.info('shutdown_signal', { signal });
  scheduler.stop();
  server.close(() => {
    logger.info('server_closed');
    process.exit(0);
  });
  // Force-exit safety net.
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  logger.error('unhandled_rejection', { error: err?.message ?? String(err) });
});
