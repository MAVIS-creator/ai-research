import { randomUUID } from 'node:crypto';
import db, { transaction } from '../db.js';
import config from '../config.js';
import { events } from './events.js';

/**
 * Classifies a network failure into a precise, human-readable reason.
 * Distinguishes DNS, TLS, timeout, and connection failures.
 */
export function classifyError(err) {
  const cause = err?.cause ?? err;
  const code = cause?.code ?? '';
  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'DNS lookup failed';
    case 'ECONNREFUSED':
      return 'Connection refused';
    case 'ECONNRESET':
      return 'Connection reset by peer';
    case 'ETIMEDOUT':
      return 'Connection timed out';
    case 'CERT_HAS_EXPIRED':
      return 'TLS certificate expired';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
      return 'TLS certificate is self-signed';
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return 'TLS certificate could not be verified';
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return `TLS certificate hostname mismatch (${cause?.host ?? 'unknown'})`;
    default:
      break;
  }
  if (err?.name === 'AbortError' || code === 'ABORT_ERR') return 'Timed out after timeout window';
  if (/^timeout$/i.test(cause?.message ?? '') || /^timeout$/i.test(err?.message ?? '')) {
    return 'Timed out after timeout window';
  }
  if (code.startsWith('ERR_TLS') || code.startsWith('ERR_SSL')) return `TLS error: ${code}`;
  return cause?.message ?? err?.message ?? 'Unknown network error';
}

/**
 * Performs an HTTP check against a monitor.
 * Never throws — always resolves to a result object.
 */
export async function performCheck(monitor, { timeoutMs } = {}) {
  const effectiveTimeout = timeoutMs ?? monitor.timeoutMs ?? config.checkTimeoutMs;
  const started = Date.now();
  let httpStatus = null;
  let error = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), effectiveTimeout);
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
    error = classifyError(err);
  }
  const durationMs = Date.now() - started;
  return {
    status: error ? 'down' : 'up',
    httpStatus,
    durationMs,
    error,
  };
}

/**
 * Records a check result and manages the incident lifecycle with
 * hysteresis: an incident opens only after N consecutive failures
 * (failure_threshold) and resolves only after M consecutive successes
 * (recovery_threshold). All state transitions happen inside one SQLite
 * transaction so concurrent workers cannot corrupt incident state.
 *
 * Monitor states: up → degraded (failing, below threshold) → down
 * (incident open) → degraded (recovering) → up.
 */
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

    const monitor = db
      .prepare('SELECT failure_threshold, recovery_threshold FROM monitors WHERE id = ?')
      .get(monitorId);
    const failThreshold = monitor?.failure_threshold ?? 1;
    const recoverThreshold = monitor?.recovery_threshold ?? 1;

    // Consecutive-failure streak ending at this check.
    let failStreak = 0;
    if (result.status === 'down') {
      const rows = db
        .prepare(`SELECT status FROM checks WHERE monitor_id = ? ORDER BY id DESC LIMIT ?`)
        .all(monitorId, failThreshold);
      failStreak = rows.every((r) => r.status === 'down') ? rows.length : 0;
    }

    // Consecutive-success streak ending at this check.
    let successStreak = 0;
    if (result.status === 'up') {
      const rows = db
        .prepare(`SELECT status FROM checks WHERE monitor_id = ? ORDER BY id DESC LIMIT ?`)
        .all(monitorId, recoverThreshold);
      successStreak = rows.every((r) => r.status === 'up') ? rows.length : 0;
    }

    const open = db
      .prepare('SELECT id FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL')
      .get(monitorId);

    // --- State transitions ---
    if (!open && result.status === 'down' && failStreak >= failThreshold) {
      const incidentId = randomUUID();
      db.prepare(
        `INSERT INTO incidents (id, monitor_id, cause_check_id, last_error) VALUES (?, ?, ?, ?)`
      ).run(incidentId, monitorId, checkId, result.error);
      return {
        checkId, checkedAt, openedIncident: incidentId, resolvedIncident: null,
        monitorState: 'down', failStreak, successStreak,
      };
    }

    if (open && result.status === 'up' && successStreak >= recoverThreshold) {
      db.prepare(`UPDATE incidents SET resolved_at = ? WHERE id = ?`).run(checkedAt, open.id);
      return {
        checkId, checkedAt, openedIncident: null, resolvedIncident: open.id,
        monitorState: 'up', failStreak, successStreak,
      };
    }

    if (open) {
      db.prepare('UPDATE incidents SET last_error = ? WHERE id = ?').run(result.error, open.id);
    }

    // Degraded: failing but not yet confirmed down, or recovering but not yet confirmed up.
    let monitorState = 'up';
    if (result.status === 'down') {
      monitorState = open ? 'down' : failStreak > 0 ? 'degraded' : 'up';
    }
    return { checkId, checkedAt, openedIncident: null, resolvedIncident: null, monitorState, failStreak, successStreak };
  });

  events.emit('check', { monitorId, ...outcome, ...result });
  return outcome;
}
