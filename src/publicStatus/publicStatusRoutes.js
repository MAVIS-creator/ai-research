import { Router } from 'express';
import db from '../db.js';
import * as incidents from '../monitors/incidentStore.js';
import { subscribe } from '../monitors/events.js';

const router = Router();

/**
 * Public status page API — no authentication.
 * PRIVACY: never exposes monitor URLs, user IDs, or raw internal error
 * strings. Only monitor display names and sanitized state are published.
 */

/** Strips potentially sensitive detail from error text before publishing. */
function sanitizeError(errorText) {
  if (!errorText) return null;
  return String(errorText)
    .replace(/https?:\/\/\S+/gi, '[redacted]')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[redacted-ip]')
    .slice(0, 200);
}

function publicMonitor(m) {
  const latest = db
    .prepare(
      `SELECT status, http_status AS httpStatus, duration_ms AS durationMs, checked_at AS checkedAt
       FROM checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1`
    )
    .get(m.id);
  const open = incidents.getOpenIncident(m.id);

  // Hourly uptime bars over the trailing window: oldest → newest.
  const uptimeBars = db
    .prepare(
      `SELECT strftime('%Y-%m-%dT%H:00:00Z', checked_at) AS hour,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up
       FROM checks
       WHERE monitor_id = ? AND checked_at >= datetime('now', '-90 hours')
       GROUP BY hour ORDER BY hour`
    )
    .all(m.id)
    .map((r) => ({
      hour: r.hour,
      uptimePercent: r.total > 0 ? Math.round((r.up / r.total) * 1000) / 10 : null,
      totalChecks: r.total,
    }));

  let state;
  if (!m.enabled) state = 'paused';
  else if (open) state = 'down';
  else if (!latest) state = 'pending';
  else state = 'up';

  return {
    id: m.id,
    name: m.name,
    state,
    uptime24h: incidents.uptimePercent(m.id, 24),
    lastCheck: latest ?? null,
    openIncident: open
      ? { id: open.id, startedAt: open.startedAt, lastError: sanitizeError(open.last_error) }
      : null,
    uptimeBars,
  };
}

router.get('/status', (req, res) => {
  const monitors = db
    .prepare('SELECT id, name, enabled FROM monitors ORDER BY name')
    .all()
    .map(publicMonitor);

  const down = monitors.filter((m) => m.state === 'down').length;
  const overall =
    monitors.length === 0 ? 'no_monitors' : down > 0 ? 'degraded' : 'operational';

  res.json({
    overall,
    generatedAt: new Date().toISOString(),
    monitors,
    recentIncidents: incidents.listAllIncidents({ limit: 15 }).map((i) => ({
      id: i.id,
      startedAt: i.startedAt,
      resolvedAt: i.resolvedAt,
      lastError: sanitizeError(i.lastError),
    })),
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
  const unsubscribe = subscribe('check', () => {
    // Lightweight refresh signal only — no private payload on the public channel.
    res.write(`event: check\ndata: {"refresh":true}\n\n`);
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
