/**
 * Seeds demo data: a demo user (demo@pulsewatch.dev / demo-password-123)
 * with a few monitors and synthetic check/incident history.
 * Safe to re-run: it upserts the demo user and replaces only that user's monitors.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import db, { migrate } from '../src/db.js';
import config from '../src/config.js';

migrate();

const DEMO_EMAIL = 'demo@pulsewatch.dev';
const DEMO_PASSWORD = 'demo-password-123';

const user = (() => {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL);
  if (existing) return existing;
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(
    id,
    DEMO_EMAIL,
    bcrypt.hashSync(DEMO_PASSWORD, config.bcryptRounds)
  );
  return { id };
})();

const targets = [
  { name: 'Example.com', url: 'https://example.com/', intervalSeconds: 60 },
  { name: 'httpbin.org', url: 'https://httpbin.org/status/200', intervalSeconds: 60 },
  { name: 'Local health endpoint', url: `http://localhost:${config.port}/api/health`, intervalSeconds: 30 },
];

db.prepare('DELETE FROM monitors WHERE user_id = ?').run(user.id);

for (const t of targets) {
  const monitorId = randomUUID();
  db.prepare(
    `INSERT INTO monitors (id, user_id, name, url, method, expected_status, interval_seconds, enabled)
     VALUES (?, ?, ?, ?, 'GET', 200, ?, 1)`
  ).run(monitorId, user.id, t.name, t.url, t.intervalSeconds);

  // Synthetic history: mostly-up checks over the past few hours.
  const insertCheck = db.prepare(
    `INSERT INTO checks (monitor_id, status, http_status, duration_ms, error, checked_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const now = Date.now();
  for (let i = 48; i >= 1; i--) {
    const ts = new Date(now - i * t.intervalSeconds * 1000).toISOString();
    const isDown = Math.random() < 0.06;
    if (isDown) {
      insertCheck.run(monitorId, 'down', null, 5000 + Math.floor(Math.random() * 3000), 'timeout after 8000ms', ts);
    } else {
      insertCheck.run(monitorId, 'up', 200, 80 + Math.floor(Math.random() * 400), null, ts);
    }
  }

  // One resolved incident in the past.
  db.prepare(
    `INSERT INTO incidents (id, monitor_id, started_at, resolved_at, last_error)
     VALUES (?, ?, ?, ?, 'timeout after 8000ms')`
  ).run(
    randomUUID(),
    monitorId,
    new Date(now - 3 * 3600_000).toISOString(),
    new Date(now - 2.8 * 3600_000).toISOString()
  );
}

console.log(`Seeded demo data. Login with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
console.log(`Database: ${config.dbFile}`);
