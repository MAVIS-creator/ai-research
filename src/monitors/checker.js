import { randomUUID } from 'node:crypto';
import db, { transaction } from '../db.js';
import config from '../config.js';
import { events } from './events.js';

/**
 * Performs an HTTP check against a monitor.
 * Never throws — always resolves to a result object.
 */
export async function performCheck(monitor, { timeoutMs = config.checkTimeoutMs } = {}) {
  const started = Date.now();
  let httpStatus = null;
  let error = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const res = await fetch(monitor.url, {
      method: monitor.method,
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'PulseWatch/1.0 (+uptime-monitor)' },
    });
    clearTimeout(timer);
    httpStatus = res.status;
    // Drain body so the socket is released.
    await res.arrayBuffer().catch(() => {});
    if (res.status !== monitor.expectedStatus) {
      error = `expected status ${monitor.expectedStatus}, got ${res.status}`;
    }
  } catch (err) {
    error = err?.cause?.message ?? err?.message ?? 'unknown network error';
  }
  const durationMs = Date.now() - started;
  return {
    status: error ? 'down' : 'up',
    httpStatus,
    durationMs,
    error,
  };
}

/** Records a check result and manages incident open/resolve transitions. */
export function recordCheck(monitorId, result) {
  const checkedAt = new Date().toISOString();
  const outcome = transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO checks (monitor_id, status, http_status, duration_ms, error, checked_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(monitorId, result.status, result.httpStatus, result.durationMs, result.error, checkedAt);
    const checkId = Number(info.lastInsertRowid);

    const open = db
      .prepare('SELECT id FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL')
      .get(monitorId);

    if (result.status === 'down' && !open) {
      const incidentId = randomUUID();
      db.prepare(
        `INSERT INTO incidents (id, monitor_id, cause_check_id, last_error) VALUES (?, ?, ?, ?)`
      ).run(incidentId, monitorId, checkId, result.error);
      return { checkId, checkedAt, openedIncident: incidentId, resolvedIncident: null };
    }

    if (result.status === 'up' && open) {
      db.prepare(
        `UPDATE incidents SET resolved_at = ? WHERE id = ?`
      ).run(checkedAt, open.id);
      return { checkId, checkedAt, openedIncident: null, resolvedIncident: open.id };
    }

    if (result.status === 'down' && open) {
      db.prepare('UPDATE incidents SET last_error = ? WHERE id = ?').run(result.error, open.id);
    }
    return { checkId, checkedAt, openedIncident: null, resolvedIncident: null };
  });

  events.emit('check', { monitorId, ...outcome, ...result });
  return outcome;
}
