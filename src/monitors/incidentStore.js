import db from '../db.js';

const rowToIncident = (r) => ({
  id: r.id,
  monitorId: r.monitor_id,
  causeCheckId: r.cause_check_id,
  startedAt: r.started_at,
  resolvedAt: r.resolved_at,
  lastError: r.last_error,
});

export function listIncidents(monitorId, { limit = 50, openOnly = false } = {}) {
  const sql = `SELECT * FROM incidents WHERE monitor_id = ? ${openOnly ? 'AND resolved_at IS NULL' : ''} ORDER BY started_at DESC LIMIT ?`;
  return db.prepare(sql).all(monitorId, limit).map(rowToIncident);
}

export function listAllIncidents({ limit = 100 } = {}) {
  return db
    .prepare('SELECT * FROM incidents ORDER BY started_at DESC LIMIT ?')
    .all(limit)
    .map(rowToIncident);
}

export function getOpenIncident(monitorId) {
  const r = db
    .prepare('SELECT * FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL')
    .get(monitorId);
  return r ? rowToIncident(r) : null;
}

/** Uptime percentage over the trailing window (default 24h). */
export function uptimePercent(monitorId, windowHours = 24) {
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up
       FROM checks WHERE monitor_id = ? AND checked_at >= ?`
    )
    .get(monitorId, since);
  if (!row || row.total === 0) return null;
  return (row.up / row.total) * 100;
}

/** Recent checks for sparklines / history views. */
export function recentChecks(monitorId, limit = 50) {
  return db
    .prepare(
      `SELECT id, status, http_status AS httpStatus, duration_ms AS durationMs, error, checked_at AS checkedAt
       FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT ?`
    )
    .all(monitorId, limit);
}
