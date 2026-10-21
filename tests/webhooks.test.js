import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import supertest from 'supertest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsewatch-hook-'));
process.env.DB_FILE = path.join(tmpDir, 'hook.db');
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
process.env.WORKER_INTERVAL_MS = '60000';

const { createApp } = await import('../src/app.js');
const db = (await import('../src/db.js')).default;
const { recordCheck } = await import('../src/monitors/checker.js');
const { createMonitor } = await import('../src/monitors/monitorStore.js');
const { createWebhook, recentDeliveries } = await import('../src/monitors/webhooks.js');
const { startWebhookDispatcher } = await import('../src/monitors/webhooks.js');

const app = createApp();
const request = () => supertest(app);

let token;
let monitorId;
let received = []; // { event, signature, body }
let hookServer;
let hookUrl;

beforeAll(async () => {
  const res = await request()
    .post('/api/auth/register')
    .send({ email: 'hook@test.dev', password: 'password-123' });
  token = res.body.token;

  monitorId = createMonitor(res.body.user.id, { name: 'Hooked', url: 'https://x.dev/' }).id;

  // Local webhook receiver we fully control.
  hookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ event: req.headers['x-pulsewatch-event'], signature: req.headers['x-pulsewatch-signature'], body });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise((r) => hookServer.listen(0, '127.0.0.1', r));
  hookUrl = `http://127.0.0.1:${hookServer.address().port}/hook`;

  startWebhookDispatcher();
});

afterAll(() => {
  hookServer?.close();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function waitForDeliveries(n, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (received.length < n && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('webhook CRUD + ownership', () => {
  it('creates a webhook with defaults', async () => {
    const res = await request()
      .post('/api/webhooks')
      .set('authorization', `Bearer ${token}`)
      .send({ url: hookUrl, secret: 'super-secret-signing-key' });
    expect(res.status).toBe(201);
    expect(res.body.webhook.events).toEqual(['incident.opened', 'incident.resolved']);
    expect(res.body.webhook.url).toBe(hookUrl);
  });

  it('rejects invalid webhook URLs and bad event names', async () => {
    const badUrl = await request()
      .post('/api/webhooks')
      .set('authorization', `Bearer ${token}`)
      .send({ url: 'ftp://x.dev/' });
    const badEvent = await request()
      .post('/api/webhooks')
      .set('authorization', `Bearer ${token}`)
      .send({ url: 'https://x.dev/hook', events: ['monitor.exploded'] });
    expect(badUrl.status).toBe(400);
    expect(badEvent.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await request().get('/api/webhooks');
    expect(res.status).toBe(401);
  });

  it('lists only own webhooks', async () => {
    const other = await request()
      .post('/api/auth/register')
      .send({ email: 'hook2@test.dev', password: 'password-456' });
    const res = await request()
      .get('/api/webhooks')
      .set('authorization', `Bearer ${other.body.token}`);
    expect(res.body.webhooks).toHaveLength(0);
  });

  it('deletes a webhook', async () => {
    const created = await request()
      .post('/api/webhooks')
      .set('authorization', `Bearer ${token}`)
      .send({ url: 'https://delete-me.dev/hook' });
    const res = await request()
      .delete(`/api/webhooks/${created.body.webhook.id}`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

describe('webhook delivery on incident transitions', () => {
  it('delivers signed incident.opened and incident.resolved events', async () => {
    await request()
      .post('/api/webhooks')
      .set('authorization', `Bearer ${token}`)
      .send({ url: hookUrl, secret: 'super-secret-signing-key' });

    const fail = () => ({ status: 'down', httpStatus: null, durationMs: 5, error: 'hook test failure' });
    const ok = () => ({ status: 'up', httpStatus: 200, durationMs: 10, error: null });

    recordCheck(monitorId, fail());
    recordCheck(monitorId, fail()); // threshold 2 → incident opens
    await waitForDeliveries(1);
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].event).toBe('incident.opened');
    const opened = JSON.parse(received[0].body);
    expect(opened.data.monitorId).toBe(monitorId);
    expect(opened.data.error).toBe('hook test failure');

    // Signature is verifiable HMAC-SHA256 of the raw body (headers are lowercased by Node).
    const expected = createHmac('sha256', 'super-secret-signing-key').update(received[0].body).digest('hex');
    expect(received[0].signature).toBe(expected);

    recordCheck(monitorId, ok());
    recordCheck(monitorId, ok()); // recovery threshold 2 → resolves
    await waitForDeliveries(2);
    expect(received[1].event).toBe('incident.resolved');
    // Resolved delivery is also signed.
    const expectedResolved = createHmac('sha256', 'super-secret-signing-key').update(received[1].body).digest('hex');
    expect(received[1].signature).toBe(expectedResolved);
  });

  it('does NOT deliver on ordinary checks without transitions', async () => {
    const before = received.length;
    recordCheck(monitorId, { status: 'up', httpStatus: 200, durationMs: 10, error: null });
    await new Promise((r) => setTimeout(r, 300));
    expect(received.length).toBe(before);
  });

  it('records delivery outcomes in the deliveries log', async () => {
    const hooks = await request().get('/api/webhooks').set('authorization', `Bearer ${token}`);
    const hook = hooks.body.webhooks.find((w) => w.url === hookUrl);
    const deliveries = await request()
      .get(`/api/webhooks/${hook.id}/deliveries`)
      .set('authorization', `Bearer ${token}`);
    expect(deliveries.status).toBe(200);
    expect(deliveries.body.deliveries.length).toBeGreaterThanOrEqual(2);
    expect(deliveries.body.deliveries.every((d) => d.status === 'success')).toBe(true);
  });

  it('records failed deliveries for unreachable endpoints', async () => {
    // Create a webhook pointing at a closed port via API.
    const res = await request()
      .post('/api/webhooks')
      .set('authorization', `Bearer ${token}`)
      .send({ url: 'http://127.0.0.1:1/dead', events: ['incident.opened'] });
    const hookId = res.body.webhook.id;

    // Trigger another incident on a fresh monitor owned by the same user.
    const user = (await import('../src/auth/authService.js')).getUserByEmail('hook@test.dev');
    const m2 = createMonitor(user.id, { name: 'Dead hook monitor', url: 'https://x.dev/', failureThreshold: 1 });
    recordCheck(m2.id, { status: 'down', httpStatus: null, durationMs: 5, error: 'dead hook test' });
    await new Promise((r) => setTimeout(r, 800));

    const deliveries = await request()
      .get(`/api/webhooks/${hookId}/deliveries`)
      .set('authorization', `Bearer ${token}`);
    expect(deliveries.body.deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries.body.deliveries[0].status).toBe('failed');
  });
});

describe('check retention', () => {
  it('prunes checks older than the retention window', async () => {
    const { pruneOldChecks } = await import('../src/monitors/retention.js');
    // Insert an ancient check directly.
    db.prepare(
      `INSERT INTO checks (monitor_id, status, duration_ms, checked_at) VALUES (?, 'up', 5, ?)`
    ).run(monitorId, new Date(Date.now() - 90 * 86_400_000).toISOString());
    const deleted = pruneOldChecks(30);
    expect(deleted).toBeGreaterThanOrEqual(1);
    const old = db
      .prepare('SELECT COUNT(*) AS n FROM checks WHERE checked_at < ?')
      .get(new Date(Date.now() - 30 * 86_400_000).toISOString()).n;
    expect(old).toBe(0);
  });
});
