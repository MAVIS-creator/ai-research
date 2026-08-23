import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function migrate(database = db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS monitors (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET' CHECK (method IN ('GET','HEAD')),
      expected_status INTEGER NOT NULL DEFAULT 200,
      interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK (interval_seconds >= 10),
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_monitors_user ON monitors(user_id);
    CREATE INDEX IF NOT EXISTS idx_monitors_due ON monitors(enabled) WHERE enabled = 1;

    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('up','down')),
      http_status INTEGER,
      duration_ms INTEGER NOT NULL,
      error TEXT,
      checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_checks_monitor_time ON checks(monitor_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      cause_check_id INTEGER REFERENCES checks(id) ON DELETE SET NULL,
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      resolved_at TEXT,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_incidents_monitor ON incidents(monitor_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // --- Incremental migrations (CREATE IF NOT EXISTS won't alter existing tables) ---
  const monitorCols = database.prepare('PRAGMA table_info(monitors)').all().map((c) => c.name);
  if (!monitorCols.includes('timeout_ms')) {
    database.exec('ALTER TABLE monitors ADD COLUMN timeout_ms INTEGER NOT NULL DEFAULT 8000 CHECK (timeout_ms BETWEEN 500 AND 30000)');
  }
  if (!monitorCols.includes('failure_threshold')) {
    database.exec("ALTER TABLE monitors ADD COLUMN failure_threshold INTEGER NOT NULL DEFAULT 2 CHECK (failure_threshold BETWEEN 1 AND 10)");
  }
  if (!monitorCols.includes('recovery_threshold')) {
    database.exec("ALTER TABLE monitors ADD COLUMN recovery_threshold INTEGER NOT NULL DEFAULT 2 CHECK (recovery_threshold BETWEEN 1 AND 10)");
  }
}

migrate();

/**
 * Minimal synchronous transaction helper mirroring better-sqlite3's API.
 * Implemented with explicit BEGIN/COMMIT/ROLLBACK statements.
 */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

export default db;
