import { Router } from 'express';
import { requireAuth } from '../auth/authService.js';
import { validateBody, monitorCreateSchema, monitorUpdateSchema } from '../validation.js';
import * as store from './monitorStore.js';
import * as incidents from './incidentStore.js';
import { performCheck, recordCheck } from './checker.js';

const router = Router();
router.use(requireAuth);

// ---------- Monitors CRUD ----------

router.get('/', (req, res) => {
  const monitors = store.listMonitors(req.user.id).map((m) => ({
    ...m,
    uptime24h: incidents.uptimePercent(m.id, 24),
    openIncident: incidents.getOpenIncident(m.id),
    recentChecks: incidents.recentChecks(m.id, 30),
  }));
  res.json({ monitors });
});

router.post('/', validateBody(monitorCreateSchema), (req, res) => {
  const monitor = store.createMonitor(req.user.id, req.body);
  req.log.info('monitor_created', { monitorId: monitor.id });
  res.status(201).json({ monitor });
});

router.get('/:id', (req, res) => {
  const monitor = store.getMonitor(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: 'not_found', message: 'Monitor not found' });
  res.json({
    monitor,
    uptime24h: incidents.uptimePercent(monitor.id, 24),
    uptime7d: incidents.uptimePercent(monitor.id, 168),
    stats: incidents.monitorStats(monitor.id),
    responseTimeSeries: incidents.responseTimeSeries(monitor.id, { windowHours: 24, buckets: 48 }),
    recentChecks: incidents.recentChecks(monitor.id, 50),
    incidents: incidents.listIncidents(monitor.id, { limit: 25 }),
  });
});

router.get('/:id/response-times', (req, res) => {
  const monitor = store.getMonitor(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: 'not_found', message: 'Monitor not found' });
  const hours = Math.min(Number.parseInt(req.query.hours ?? '24', 10) || 24, 168);
  const buckets = Math.min(Number.parseInt(req.query.buckets ?? '48', 10) || 48, 200);
  res.json({ series: incidents.responseTimeSeries(monitor.id, { windowHours: hours, buckets }) });
});

router.patch('/:id', validateBody(monitorUpdateSchema), (req, res) => {
  const monitor = store.updateMonitor(req.params.id, req.user.id, req.body);
  if (!monitor) return res.status(404).json({ error: 'not_found', message: 'Monitor not found' });
  req.log.info('monitor_updated', { monitorId: monitor.id });
  res.json({ monitor });
});

router.delete('/:id', (req, res) => {
  const deleted = store.deleteMonitor(req.params.id, req.user.id);
  if (!deleted) return res.status(404).json({ error: 'not_found', message: 'Monitor not found' });
  req.log.warn('monitor_deleted', { monitorId: req.params.id });
  res.status(204).end();
});

// ---------- Actions & history ----------

/** On-demand check, independent of the schedule. */
router.post('/:id/check', async (req, res, next) => {
  const monitor = store.getMonitor(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: 'not_found', message: 'Monitor not found' });
  try {
    const result = await performCheck(monitor);
    const recorded = recordCheck(monitor.id, result);
    res.json({ result, outcome: recorded });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/checks', (req, res) => {
  const monitor = store.getMonitor(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: 'not_found', message: 'Monitor not found' });
  const limit = Math.min(Number.parseInt(req.query.limit ?? '50', 10) || 50, 500);
  res.json({ checks: incidents.recentChecks(monitor.id, limit) });
});

router.get('/:id/incidents', (req, res) => {
  const monitor = store.getMonitor(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: 'not_found', message: 'Monitor not found' });
  const openOnly = req.query.open === 'true';
  res.json({ incidents: incidents.listIncidents(monitor.id, { openOnly }) });
});

export default router;
