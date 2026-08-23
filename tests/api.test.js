import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import supertest from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated temp DB for the test run — must be set before importing app modules.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsewatch-test-'));
process.env.DB_FILE = path.join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
process.env.WORKER_INTERVAL_MS = '60000'; // keep scheduler idle during API tests

const { createApp } = await import('../src/app.js');
const db = (await import('../src/db.js')).default;

const app = createApp();
const request = () => supertest(app);

let token;
let monitorId;

beforeAll(async () => {
  const res = await request()
    .post('/api/auth/register')
    .send({ email: 'test@example.com', password: 'super-secret-9' });
  expect(res.status).toBe(201);
  token = res.body.token;
});

afterAll(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('health', () => {
  it('returns ok', async () => {
    const res = await request().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('auth', () => {
  it('rejects duplicate registration', async () => {
    const res = await request()
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'super-secret-9' });
    expect(res.status).toBe(409);
  });

  it('rejects invalid payloads with structured errors', async () => {
    const res = await request().post('/api/auth/register').send({ email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('rejects bad credentials without leaking which factor failed', async () => {
    const wrongPw = await request()
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrong-password' });
    const noUser = await request()
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'wrong-password' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
  });

  it('rejects requests without a token', async () => {
    const res = await request().get('/api/monitors');
    expect(res.status).toBe(401);
  });

  it('rejects tampered tokens', async () => {
    const res = await request()
      .get('/api/monitors')
      .set('authorization', `Bearer ${token}x`);
    expect(res.status).toBe(401);
  });
});

describe('monitors CRUD + ownership', () => {
  it('creates a monitor', async () => {
    const res = await request()
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send({ name: 'Example', url: 'https://example.com/', intervalSeconds: 30 });
    expect(res.status).toBe(201);
    monitorId = res.body.monitor.id;
    expect(res.body.monitor.enabled).toBe(true);
    expect(res.body.monitor.intervalSeconds).toBe(30);
  });

  it('rejects invalid URLs and non-http protocols', async () => {
    const badUrl = await request()
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send({ name: 'x', url: 'not-a-url' });
    const ftp = await request()
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send({ name: 'x', url: 'ftp://example.com/' });
    expect(badUrl.status).toBe(400);
    expect(ftp.status).toBe(400);
  });

  it('enforces interval bounds', async () => {
    const res = await request()
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send({ name: 'too fast', url: 'https://example.com/', intervalSeconds: 5 });
    expect(res.status).toBe(400);
  });

  it('updates a monitor partially', async () => {
    const res = await request()
      .patch(`/api/monitors/${monitorId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ enabled: false, name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.monitor.enabled).toBe(false);
    expect(res.body.monitor.name).toBe('Renamed');
    expect(res.body.monitor.url).toBe('https://example.com/');
  });

  it("prevents access to another user's monitor", async () => {
    const other = await request()
      .post('/api/auth/register')
      .send({ email: 'other@example.com', password: 'other-secret-1' });
    const res = await request()
      .get(`/api/monitors/${monitorId}`)
      .set('authorization', `Bearer ${other.body.token}`);
    expect(res.status).toBe(404); // not 403 — avoids existence leak
  });

  it('deletes a monitor', async () => {
    const res = await request()
      .delete(`/api/monitors/${monitorId}`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    const gone = await request()
      .get(`/api/monitors/${monitorId}`)
      .set('authorization', `Bearer ${token}`);
    expect(gone.status).toBe(404);
  });
});

describe('checking & incidents', () => {
  let liveMonitorId;
  let targetServer;

  beforeAll(async () => {
    // A real HTTP target that stays up for the duration of these tests.
    const http = await import('node:http');
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    await new Promise((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
    const port = targetServer.address().port;
    const res = await request()
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send({ name: 'Self health', url: `http://127.0.0.1:${port}/api/health`, intervalSeconds: 60 });
    liveMonitorId = res.body.monitor.id;
  });

  afterAll(() => {
    targetServer?.close();
  });

  it('performs an on-demand check that succeeds', async () => {
    const res = await request()
      .post(`/api/monitors/${liveMonitorId}/check`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.result.status).toBe('up');
    expect(res.body.outcome.openedIncident).toBeNull();
  });

  it('records checks retrievable via history endpoint', async () => {
    const res = await request()
      .get(`/api/monitors/${liveMonitorId}/checks`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.checks.length).toBeGreaterThanOrEqual(1);
    expect(res.body.checks[0].status).toBe('up');
  });

  it('opens an incident when the target goes down and resolves on recovery', async () => {
    // Simulate a failing check directly through the checker's record path.
    const checker = await import('../src/monitors/checker.js');
    checker.recordCheck(liveMonitorId, { status: 'down', httpStatus: null, durationMs: 10, error: 'boom' });
    let incidentsRes = await request()
      .get(`/api/monitors/${liveMonitorId}/incidents?open=true`)
      .set('authorization', `Bearer ${token}`);
    expect(incidentsRes.body.incidents).toHaveLength(1);

    // A second failure must NOT open a second incident.
    checker.recordCheck(liveMonitorId, { status: 'down', httpStatus: null, durationMs: 10, error: 'still down' });
    incidentsRes = await request()
      .get(`/api/monitors/${liveMonitorId}/incidents?open=true`)
      .set('authorization', `Bearer ${token}`);
    expect(incidentsRes.body.incidents).toHaveLength(1);

    // Recovery resolves it.
    checker.recordCheck(liveMonitorId, { status: 'up', httpStatus: 200, durationMs: 5, error: null });
    incidentsRes = await request()
      .get(`/api/monitors/${liveMonitorId}/incidents?open=true`)
      .set('authorization', `Bearer ${token}`);
    expect(incidentsRes.body.incidents).toHaveLength(0);
  });

  it('computes uptime percentage', async () => {
    const { uptimePercent } = await import('../src/monitors/incidentStore.js');
    const pct = uptimePercent(liveMonitorId, 24);
    expect(pct).not.toBeNull();
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});

describe('public status page', () => {
  it('aggregates status without authentication', async () => {
    const res = await request().get('/api/public/status');
    expect(res.status).toBe(200);
    expect(['operational', 'degraded', 'no_monitors']).toContain(res.body.overall);
    expect(Array.isArray(res.body.monitors)).toBe(true);
  });
});
