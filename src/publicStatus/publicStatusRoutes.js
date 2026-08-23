import { Router } from 'express';
import db from '../db.js';
import * as incidents from '../monitors/incidentStore.js';
import { subscribe } from '../monitors/events.js';

const router = Router();

/**
 * Public status page API — no authentication.
 * Aggregates overall + per-monitor status. Monitors are global in this
 * deployment model (single-tenant public page).
 */
router.get('/status', (req, res) => {
  const monitors = db
    .prepare('SELECT id, name, url, enabled, created_at AS createdAt FROM monitors ORDER BY name')
    .all()
    .map((m) => {
      const latest = db
        .prepare(
          `SELECT status, http_status AS httpStatus, duration_ms AS durationMs, checked_at AS checkedAt, error
           FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1`
        )
        .get(m.id);
      const open = incidents.getOpenIncident(m.id);
      return {
        ...m,
        state: !m.enabled ? 'paused' : open ? 'down' : latest ? 'up' : 'pending',
        uptime24h: incidents.uptimePercent(m.id, 24),
        lastCheck: latest ?? null,
        openIncident: open,
      };
    });

  const down = monitors.filter((m) => m.state === 'down').length;
  const overall = monitors.length === 0 ? 'no_monitors' : down > 0 ? 'degraded' : 'operational';

  res.json({
    overall,
    generatedAt: new Date().toISOString(),
    monitors,
    recentIncidents: incidents.listAllIncidents({ limit: 10 }),
  });
});

/** Live SSE feed for the public status page (unauthenticated). */
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write(`retry: 3000\n\n`);
  const unsubscribe = subscribe('check', (payload) => {
    res.write(`event: check\ndata: ${JSON.stringify(payload)}\n\n`);
  });
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15_000);
  const cleanup = () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
});

export default router;
