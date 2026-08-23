import { randomUUID } from 'node:crypto';
import db from '../db.js';

const rowToMonitor = (r) => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  url: r.url,
  method: r.method,
  expectedStatus: r.expected_status,
  intervalSeconds: r.interval_seconds,
  enabled: !!r.enabled,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listMonitors(userId) {
  return db
    .prepare('SELECT * FROM monitors WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map(rowToMonitor);
}

export function getMonitor(id, userId) {
  const r = db.prepare('SELECT * FROM monitors WHERE id = ? AND user_id = ?').get(id, userId);
  return r ? rowToMonitor(r) : null;
}

export function createMonitor(userId, data) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO monitors (id, user_id, name, url, method, expected_status, interval_seconds, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    data.name,
    data.url,
    data.method,
    data.expectedStatus,
    data.intervalSeconds,
    data.enabled ? 1 : 0
  );
  return getMonitor(id, userId);
}

export function updateMonitor(id, userId, patch) {
  const existing = getMonitor(id, userId);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  db.prepare(
    `UPDATE monitors SET name=?, url=?, method=?, expected_status=?, interval_seconds=?, enabled=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id=? AND user_id=?`
  ).run(
    next.name,
    next.url,
    next.method,
    next.expectedStatus,
    next.intervalSeconds,
    next.enabled ? 1 : 0,
    id,
    userId
  );
  return getMonitor(id, userId);
}

export function deleteMonitor(id, userId) {
  // ON DELETE CASCADE removes checks and incidents transactionally.
  const info = db.prepare('DELETE FROM monitors WHERE id = ? AND user_id = ?').run(id, userId);
  return info.changes > 0;
}

/** Monitors whose next due time has passed (used by the scheduler). */
export function dueMonitors(nowIso) {
  return db
    .prepare(
      `SELECT m.*, MAX(c.checked_at) AS last_checked
       FROM monitors m LEFT JOIN checks c ON c.monitor_id = m.id
       WHERE m.enabled = 1
       GROUP BY m.id
       HAVING last_checked IS NULL OR datetime(last_checked, '+' || m.interval_seconds || ' seconds') <= datetime(?)`
    )
    .all(nowIso)
    .map(rowToMonitor);
}
