import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import supertest from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsewatch-sec-'));
process.env.DB_FILE = path.join(tmpDir, 'sec.db');
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
process.env.WORKER_INTERVAL_MS = '60000';

const { createApp } = await import('../src/app.js');
const db = (await import('../src/db.js')).default;

const app = createApp();
const request = () => supertest(app);

let tokenA; // user A
let tokenB; // user B
let monitorA; // belongs to user A

beforeAll(async () => {
  const a = await request()
    .post('/api/auth/register')
    .send({ email: 'alice@sec.test', password: 'alice-password' });
  tokenA = a.body.token;
  const b = await request()
    .post('/api/auth/register')
    .send({ email: 'bob@sec.test', password: 'bob-password2' });
  tokenB = b.body.token;

  const m = await request()
    .post('/api/monitors')
    .set('authorization', `Bearer ${tokenA}`)
    .send({ name: 'Alice secret monitor', url: 'https://secret.example.internal/', intervalSeconds: 60 });
  monitorA = m.body.monitor;
});

afterAll(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('rate limiting on auth endpoints', () => {
  it('returns 429 after exceeding the attempt limit', async () => {
    // The limiter allows 10/min per IP; earlier tests in this file already
    // consumed some. Hammer until we hit 429 within a bounded number of tries.
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request()
        .post('/api/auth/login')
        .send({ email: 'nobody@sec.test', password: 'wrong-password-x' });
      if (res.status === 429) {
        got429 = true;
        expect(res.body.error).toBe('rate_limited');
        expect(res.headers['retry-after']).toBeDefined();
        break;
      }
      expect([401, 400]).toContain(res.status);
    }
    expect(got429).toBe(true);
  });
});

describe('authorization boundaries (IDOR)', () => {
  it("user B cannot READ user A's monitor", async () => {
    const res = await request()
      .get(`/api/monitors/${monitorA.id}`)
      .set('authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("user B cannot UPDATE user A's monitor", async () => {
    const res = await request()
      .patch(`/api/monitors/${monitorA.id}`)
      .set('authorization', `Bearer ${tokenB}`)
      .send({ name: 'hacked' });
    expect(res.status).toBe(404);
    // Confirm nothing changed.
    const check = await request()
      .get(`/api/monitors/${monitorA.id}`)
      .set('authorization', `Bearer ${tokenA}`);
    expect(check.body.monitor.name).toBe('Alice secret monitor');
  });

  it("user B cannot DELETE user A's monitor", async () => {
    const res = await request()
      .delete(`/api/monitors/${monitorA.id}`)
      .set('authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
    const check = await request()
      .get(`/api/monitors/${monitorA.id}`)
      .set('authorization', `Bearer ${tokenA}`);
    expect(check.status).toBe(200);
  });

  it("user B cannot trigger checks on user A's monitor", async () => {
    const res = await request()
      .post(`/api/monitors/${monitorA.id}/check`)
      .set('authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("user B cannot read user A's check history or incidents", async () => {
    const checks = await request()
      .get(`/api/monitors/${monitorA.id}/checks`)
      .set('authorization', `Bearer ${tokenB}`);
    const incidents = await request()
      .get(`/api/monitors/${monitorA.id}/incidents`)
      .set('authorization', `Bearer ${tokenB}`);
    expect(checks.status).toBe(404);
    expect(incidents.status).toBe(404);
  });

  it("user A's monitor list contains only their own monitors", async () => {
    const res = await request().get('/api/monitors').set('authorization', `Bearer ${tokenB}`);
    expect(res.body.monitors).toHaveLength(0);
  });

  it('rejects malformed JWTs and forged tokens signed with the wrong key', async () => {
    const malformed = await request()
      .get('/api/monitors')
      .set('authorization', 'Bearer not.a.jwt');
    expect(malformed.status).toBe(401);

    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign(
      { sub: '00000000-0000-0000-0000-000000000000', role: 'admin' },
      'attacker-controlled-secret'
    );
    const res = await request().get('/api/monitors').set('authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects other auth schemes (Basic, raw token)', async () => {
    const basic = await request()
      .get('/api/monitors')
      .set('authorization', 'Basic dXNlcjpwYXNz');
    const raw = await request().get('/api/monitors').set('authorization', tokenA.slice(0, 20));
    expect(basic.status).toBe(401);
    expect(raw.status).toBe(401);
  });
});

describe('input hardening', () => {
  it('rejects non-object bodies', async () => {
    const res = await request()
      .post('/api/monitors')
      .set('authorization', `Bearer ${tokenA}`)
      .type('json')
      .send('"just a string"');
    expect(res.status).toBe(400);
  });

  it('rejects unknown-type fields gracefully (no crash)', async () => {
    const res = await request()
      .post('/api/monitors')
      .set('authorization', `Bearer ${tokenA}`)
      .send({ name: { $ne: null }, url: ['array'], intervalSeconds: 'sixty' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('truncates oversized JSON bodies with 413', async () => {
    const big = 'x'.repeat(200 * 1024); // > 100kb limit
    const res = await request()
      .post('/api/monitors')
      .set('authorization', `Bearer ${tokenA}`)
      .send({ name: big, url: 'https://x.dev/' });
    expect([413, 400]).toContain(res.status);
  });

  it('does not leak stack traces in error responses', async () => {
    const res = await request().get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+\w+\s+\(/); // no stack frames
  });
});

describe('public status privacy', () => {
  it('never exposes monitor URLs publicly', async () => {
    const res = await request().get('/api/public/status');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret.example.internal');
    expect(body).not.toContain('"url"');
  });

  it('never exposes user IDs or emails publicly', async () => {
    const res = await request().get('/api/public/status');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('alice@sec.test');
    expect(body).not.toContain('userId');
  });

  it('sanitizes URLs out of public incident errors', async () => {
    // Record an incident whose error text embeds the private URL.
    const checker = await import('../src/monitors/checker.js');
    checker.recordCheck(monitorA.id, { status: 'down', httpStatus: null, durationMs: 5, error: 'failed to reach https://secret.example.internal/api from 10.1.2.3' });
    checker.recordCheck(monitorA.id, { status: 'down', httpStatus: null, durationMs: 5, error: 'failed to reach https://secret.example.internal/api from 10.1.2.3' });

    const res = await request().get('/api/public/status');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secret.example.internal');
    expect(body).not.toContain('10.1.2.3');
  });
});
