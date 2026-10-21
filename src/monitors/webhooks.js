import { createHmac, randomUUID } from 'node:crypto';
import db from '../db.js';
import { logger } from '../logger.js';
import { subscribe } from './events.js';

const rowToWebhook = (r) => ({
  id: r.id,
  userId: r.user_id,
  url: r.url,
  events: r.events.split(',').map((s) => s.trim()).filter(Boolean),
  secret: r.secret ?? null,
  enabled: !!r.enabled,
  createdAt: r.created_at,
});

/** Public shape for API responses — never exposes the signing secret. */
function publicWebhook(w) {
  const { secret, ...rest } = w;
  return rest;
}

export function listWebhooks(userId) {
  return db.prepare('SELECT * FROM webhooks WHERE user_id = ? ORDER BY created_at').all(userId).map(rowToWebhook);
}

export function createWebhook(userId, { url, events, secret }) {
  const id = randomUUID();
  db.prepare('INSERT INTO webhooks (id, user_id, url, events, secret) VALUES (?, ?, ?, ?, ?)').run(
    id,
    userId,
    url,
    (events ?? ['incident.opened', 'incident.resolved']).join(','),
    secret ?? null
  );
  return getWebhook(id, userId);
}

export function getWebhook(id, userId) {
  const r = db.prepare('SELECT * FROM webhooks WHERE id = ? AND user_id = ?').get(id, userId);
  return r ? rowToWebhook(r) : null;
}

export function deleteWebhook(id, userId) {
  return db.prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export function recentDeliveries(webhookId, limit = 20) {
  return db
    .prepare(
      `SELECT id, event, status, response_status AS responseStatus, error, attempted_at AS attemptedAt
       FROM webhook_deliveries WHERE webhook_id = ? ORDER BY attempted_at DESC LIMIT ?`
    )
    .all(webhookId, limit);
}

/** Signs a payload the same way GitHub webhooks do (HMAC-SHA256 hex). */
function sign(secret, body) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Fire-and-forget delivery with timeout. Never throws. */
async function deliver(webhook, event, payload) {
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const started = Date.now();
  let ok = false;
  let responseStatus = null;
  let error = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const headers = { 'content-type': 'application/json', 'x-pulsewatch-event': event };
    if (webhook.secret) headers['x-pulsewatch-signature'] = sign(webhook.secret, body);
    const res = await fetch(webhook.url, { method: 'POST', headers, body, signal: controller.signal });
    clearTimeout(timer);
    responseStatus = res.status;
    await res.arrayBuffer().catch(() => {});
    ok = res.status >= 200 && res.status < 300;
    if (!ok) error = `non-2xx response: ${res.status}`;
  } catch (err) {
    error = err?.name === 'AbortError' ? 'delivery timed out after 5s' : err?.message ?? 'delivery failed';
  }
  try {
    db.prepare(
      `INSERT INTO webhook_deliveries (webhook_id, event, status, response_status, error) VALUES (?, ?, ?, ?, ?)`
    ).run(webhook.id, event, ok ? 'success' : 'failed', responseStatus, error);
  } catch (err) {
    logger.error('webhook_delivery_log_failed', { error: err.message });
  }
  logger.info('webhook_delivered', {
    webhookId: webhook.id,
    event,
    ok,
    responseStatus,
    durationMs: Date.now() - started,
  });
}

/** Subscribes to the event bus and dispatches matching webhooks. */
export function startWebhookDispatcher() {
  return subscribe('check', (payload) => {
    // Deliver on incident transitions only — not every check.
    let event = null;
    if (payload.openedIncident) event = 'incident.opened';
    else if (payload.resolvedIncident) event = 'incident.resolved';
    if (!event) return;

    // Webhooks are per-user; monitors are per-user. Resolve the owner.
    const monitor = db.prepare('SELECT user_id, name FROM monitors WHERE id = ?').get(payload.monitorId);
    if (!monitor) return;

    const hooks = db
      .prepare('SELECT * FROM webhooks WHERE user_id = ? AND enabled = 1')
      .all(monitor.user_id)
      .map(rowToWebhook)
      .filter((w) => w.events.includes(event));

    const safePayload = {
      monitorId: payload.monitorId,
      monitorName: monitor.name,
      status: payload.status,
      error: payload.error ?? null,
      incidentId: payload.openedIncident ?? payload.resolvedIncident,
      durationMs: payload.durationMs,
    };

    for (const hook of hooks) {
      // Intentionally not awaited: delivery must not block the check pipeline.
      deliver(hook, event, safePayload).catch((err) =>
        logger.error('webhook_dispatch_failed', { webhookId: hook.id, error: err.message })
      );
    }
  });
}
