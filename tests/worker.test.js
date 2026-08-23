import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Isolated temp DB for this suite.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulsewatch-worker-'));
process.env.DB_FILE = path.join(tmpDir, 'worker.db');
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';

const db = (await import('../src/db.js')).default;
const { createUser } = await import('../src/auth/authService.js');
const { createMonitor } = await import('../src/monitors/monitorStore.js');
const { performCheck, recordCheck, classifyError } = await import('../src/monitors/checker.js');

const user = createUser({ email: 'worker@test.dev', password: 'password-123' });

/** Local HTTP target whose behavior tests control per-test. */
let targetMode = 'ok'; // ok | fail | slow | flaky
let targetServer;
let targetUrl;

beforeAll(async () => {
  targetServer = http.createServer((req, res) => {
    if (targetMode === 'fail') {
      res.writeHead(500).end('boom');
    } else if (targetMode === 'slow') {
      setTimeout(() => res.writeHead(200).end('slow'), 1500);
    } else {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    }
  });
  await new Promise((r) => targetServer.listen(0, '127.0.0.1', r));
  targetUrl = `http://127.0.0.1:${targetServer.address().port}/`;
});

afterAll(() => {
  targetServer?.close();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeMonitor(overrides = {}) {
  return createMonitor(user.id, {
    name: 'Worker test',
    url: targetUrl,
    intervalSeconds: 60,
    timeoutMs: 1000,
    failureThreshold: 2,
    recoveryThreshold: 2,
    ...overrides,
  });
}

describe('failure classification', () => {
  it('classifies DNS failures', () => {
    const err = Object.assign(new Error('getaddrinfo failed'), {
      cause: { code: 'ENOTFOUND' },
    });
    expect(classifyError(err)).toBe('DNS lookup failed');
  });

  it('classifies connection refused', () => {
    const err = new Error('refused', { cause: { code: 'ECONNREFUSED' } });
    expect(classifyError(err)).toBe('Connection refused');
  });

  it('classifies abort as timeout', () => {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    expect(classifyError(err)).toContain('Timed out');
  });
});

describe('performCheck against real failure modes', () => {
  it('detects HTTP 500 as down with a useful reason', async () => {
    targetMode = 'fail';
    const m = makeMonitor({ name: '500-test', expectedStatus: 200 });
    const result = await performCheck(m);
    expect(result.status).toBe('down');
    expect(result.httpStatus).toBe(500);
    expect(result.error).toContain('expected status 200, got 500');
  });

  it('detects timeout on slow responses and respects per-monitor timeout', async () => {
    targetMode = 'slow';
    const m = makeMonitor({ name: 'timeout-test', timeoutMs: 500 });
    const started = Date.now();
    const result = await performCheck(m);
    expect(result.status).toBe('down');
    expect(result.error).toContain('Timed out');
    // Should abort near the 500ms timeout, not wait the full 1500ms.
    expect(Date.now() - started).toBeLessThan(1400);
  });

  it('succeeds when the target recovers', async () => {
    targetMode = 'ok';
    const m = makeMonitor({ name: 'recover-test' });
    const result = await performCheck(m);
    expect(result.status).toBe('up');
    expect(result.httpStatus).toBe(200);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports DNS failure for unresolvable hosts', async () => {
    const m = makeMonitor({ name: 'dns-test', url: 'http://this-host-does-not-exist-pulsewatch.invalid/' });
    const result = await performCheck(m);
    expect(result.status).toBe('down');
    expect(result.error.toLowerCase()).toMatch(/dns|lookup/);
  }, 15_000);

  it('reports connection refused for closed ports', async () => {
    // Port 1 on localhost is virtually always closed.
    const m = makeMonitor({ name: 'refused-test', url: 'http://127.0.0.1:1/' });
    const result = await performCheck(m);
    expect(result.status).toBe('down');
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  }, 15_000);
});

describe('incident lifecycle with thresholds', () => {
  it('does NOT open an incident on first failure (threshold=2)', () => {
    targetMode = 'fail';
    const m = makeMonitor({ name: 'threshold-test', failureThreshold: 3 });
    const o1 = recordCheck(m.id, { status: 'down', httpStatus: 500, durationMs: 5, error: 'f1' });
    expect(o1.openedIncident).toBeNull();
    expect(o1.monitorState).toBe('degraded');

    const o2 = recordCheck(m.id, { status: 'down', httpStatus: 500, durationMs: 5, error: 'f2' });
    expect(o2.openedIncident).toBeNull(); // streak=2 < threshold=3
    expect(o2.monitorState).toBe('degraded');

    const o3 = recordCheck(m.id, { status: 'down', httpStatus: 500, durationMs: 5, error: 'f3' });
    expect(o3.openedIncident).not.toBeNull();
    expect(o3.monitorState).toBe('down');
  });

  it('opens exactly ONE incident regardless of how many extra failures occur', () => {
    const m = makeMonitor({ name: 'dedupe-test', failureThreshold: 1 });
    const o1 = recordCheck(m.id, { status: 'down', httpStatus: null, durationMs: 5, error: 'x' });
    expect(o1.openedIncident).not.toBeNull();

    for (let i = 0; i < 5; i++) {
      const o = recordCheck(m.id, { status: 'down', httpStatus: null, durationMs: 5, error: `x${i}` });
      expect(o.openedIncident).toBeNull(); // no duplicate incidents
    }

    const openCount = db
      .prepare('SELECT COUNT(*) AS n FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL')
      .get(m.id).n;
    expect(openCount).toBe(1);
  });

  it('requires recovery_threshold consecutive successes to resolve', () => {
    const m = makeMonitor({ name: 'recovery-test', failureThreshold: 1, recoveryThreshold: 3 });
    recordCheck(m.id, { status: 'down', httpStatus: null, durationMs: 5, error: 'down' });

    const r1 = recordCheck(m.id, { status: 'up', httpStatus: 200, durationMs: 10, error: null });
    expect(r1.resolvedIncident).toBeNull(); // 1 success < 3

    const r2 = recordCheck(m.id, { status: 'up', httpStatus: 200, durationMs: 10, error: null });
    expect(r2.resolvedIncident).toBeNull(); // 2 successes < 3

    const r3 = recordCheck(m.id, { status: 'up', httpStatus: 200, durationMs: 10, error: null });
    expect(r3.resolvedIncident).not.toBeNull(); // 3rd success resolves

    const openCount = db
      .prepare('SELECT COUNT(*) AS n FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL')
      .get(m.id).n;
    expect(openCount).toBe(0);
  });

  it('a single failure during recovery does not resolve the incident', () => {
    const m = makeMonitor({ name: 'flap-test', failureThreshold: 1, recoveryThreshold: 2 });
    recordCheck(m.id, { status: 'down', httpStatus: null, durationMs: 5, error: 'down' });
    recordCheck(m.id, { status: 'up', httpStatus: 200, durationMs: 10, error: null }); // 1/2
    recordCheck(m.id, { status: 'down', httpStatus: null, durationMs: 5, error: 'still bad' }); // resets streak
    const stillOpen = db
      .prepare('SELECT COUNT(*) AS n FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL')
      .get(m.id).n;
    expect(stillOpen).toBe(1);
  });

  it('handles concurrent recordCheck calls without duplicating incidents', async () => {
    const m = makeMonitor({ name: 'concurrent-test', failureThreshold: 1 });
    // Fire 10 concurrent failing checks; only one incident may be created.
    await Promise.all(
      Array.from({ length: 10 }, () =>
        Promise.resolve().then(() =>
          recordCheck(m.id, { status: 'down', httpStatus: null, durationMs: 5, error: 'concurrent' })
        )
      )
    );
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM incidents WHERE monitor_id = ?')
      .get(m.id).n;
    expect(count).toBe(1);
  });
});
