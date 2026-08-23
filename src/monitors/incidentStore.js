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

/**
 * Response-time series bucketed into N points over a trailing window.
 * Returns oldest → newest arrays suitable for charting.
 */
export function responseTimeSeries(monitorId, { windowHours = 24, buckets = 48 } = {}) {
  const sinceIso = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const rows = db
    .prepare(
      `SELECT duration_ms AS durationMs, status, checked_at AS checkedAt
       FROM checks WHERE monitor_id = ? AND checked_at >= ?
       ORDER BY checked_at ASC`
    )
    .all(monitorId, sinceIso);
  if (rows.length === 0) return [];

  const bucketMs = (windowHours * 3600_000) / buckets;
  const startMs = Date.now() - windowHours * 3600_000;
  const out = Array.from({ length: buckets }, () => ({ count: 0, sum: 0, max: 0, down: 0 }));
  for (const r of rows) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((Date.parse(r.checkedAt) - startMs) / bucketMs)));
    out[idx].count += 1;
    out[idx].sum += r.durationMs;
    out[idx].max = Math.max(out[idx].max, r.durationMs);
    if (r.status === 'down') out[idx].down += 1;
  }
  return out.map((b, i) => ({
    t: new Date(startMs + i * bucketMs).toISOString(),
    avgMs: b.count ? Math.round(b.sum / b.count) : null,
    maxMs: b.count ? b.max : null,
    downCount: b.down,
  }));
}

/** Aggregate stats for dashboard cards. */
export function monitorStats(monitorId) {
  const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up,
              AVG(duration_ms) AS avgDuration,
              MIN(duration_ms) AS minDuration,
              MAX(duration_ms) AS maxDuration
       FROM checks WHERE monitor_id = ? AND checked_at >= ?`
    )
    .get(monitorId, since24);
  return {
    totalChecks24h: row?.total ?? 0,
    avgResponseMs: row?.avgDuration != null ? Math.round(row.avgDuration) : null,
    minResponseMs: row?.minDuration ?? null,
    maxResponseMs: row?.maxDuration ?? null,
  };
}
