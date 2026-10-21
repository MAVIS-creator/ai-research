import db from '../db.js';
import config from '../config.js';
import { logger } from '../logger.js';

/**
 * Retention sweeper: prunes check history beyond the retention window so
 * long-running deployments don't grow unbounded. Incidents are kept (they
 * are the audit record); only raw checks are pruned.
 */
export function pruneOldChecks(retentionDays = config.checkRetentionDays) {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const info = db.prepare('DELETE FROM checks WHERE checked_at < ?').run(cutoff);
  if (info.changes > 0) {
    logger.info('retention_pruned', { deletedChecks: info.changes, cutoff });
  }
  return info.changes;
}

export function startRetentionSweeper() {
  // Run once at boot, then daily.
  pruneOldChecks();
  const timer = setInterval(() => {
    try {
      pruneOldChecks();
    } catch (err) {
      logger.error('retention_sweep_failed', { error: err.message });
    }
  }, 24 * 3600_000);
  timer.unref();
  logger.info('retention_sweeper_started', { retentionDays: config.checkRetentionDays });
  return timer;
}
