import db from '../db.js';
import config from '../config.js';
import { dueMonitors } from './monitorStore.js';
import { performCheck, recordCheck } from './checker.js';
import { events } from './events.js';
import { logger } from '../logger.js';

/**
 * Background scheduler: every tick, find due monitors and check them
 * concurrently (bounded). A simple in-flight set prevents overlapping
 * checks of the same monitor if a tick takes longer than an interval.
 */
export class Scheduler {
  #timer = null;
  #inFlight = new Set();
  #running = false;

  start() {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      this.tick().catch((err) => logger.error('scheduler_tick_failed', { error: err.message }));
    }, config.workerIntervalMs);
    this.#timer.unref();
    logger.info('scheduler_started', { intervalMs: config.workerIntervalMs });
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    logger.info('scheduler_stopped');
  }

  async tick() {
    if (this.#running) return;
    this.#running = true;
    try {
      const due = dueMonitors(new Date().toISOString()).filter(
        (m) => !this.#inFlight.has(m.id)
      );
      await Promise.all(due.map((m) => this.checkMonitor(m)));
    } finally {
      this.#running = false;
    }
  }

  async checkMonitor(monitor) {
    this.#inFlight.add(monitor.id);
    try {
      const result = await performCheck(monitor);
      const outcome = recordCheck(monitor.id, result);
      logger.debug('check_completed', {
        monitorId: monitor.id,
        status: result.status,
        httpStatus: result.httpStatus,
        durationMs: result.durationMs,
        openedIncident: outcome.openedIncident,
        resolvedIncident: outcome.resolvedIncident,
      });
      return outcome;
    } catch (err) {
      // recordCheck is transactional; reaching here means unexpected failure.
      logger.error('check_record_failed', { monitorId: monitor.id, error: err.message });
      events.emit('check_error', { monitorId: monitor.id, error: err.message });
    } finally {
      this.#inFlight.delete(monitor.id);
    }
  }
}
