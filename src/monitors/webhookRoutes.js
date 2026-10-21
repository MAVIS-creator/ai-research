import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/authService.js';
import { validateBody } from '../validation.js';
import * as store from './webhooks.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => ['http:', 'https:'].includes(new URL(u).protocol), {
      message: 'URL must use http or https',
    }),
  events: z
    .array(z.enum(['incident.opened', 'incident.resolved']))
    .min(1)
    .default(['incident.opened', 'incident.resolved']),
  secret: z.string().min(16).max(128).optional(),
});

router.get('/', (req, res) => {
  // Never expose signing secrets in API responses.
  res.json({ webhooks: store.listWebhooks(req.user.id).map((w) => ({ ...w, secret: undefined })) });
});

router.post('/', validateBody(createSchema), (req, res) => {
  const webhook = store.createWebhook(req.user.id, req.body);
  req.log.info('webhook_created', { webhookId: webhook.id });
  res.status(201).json({ webhook: { ...webhook, secret: undefined } });
});

router.get('/:id/deliveries', (req, res) => {
  const webhook = store.getWebhook(req.params.id, req.user.id);
  if (!webhook) return res.status(404).json({ error: 'not_found', message: 'Webhook not found' });
  res.json({ deliveries: store.recentDeliveries(req.params.id) });
});

router.delete('/:id', (req, res) => {
  const deleted = store.deleteWebhook(req.params.id, req.user.id);
  if (!deleted) return res.status(404).json({ error: 'not_found', message: 'Webhook not found' });
  req.log.warn('webhook_deleted', { webhookId: req.params.id });
  res.status(204).end();
});

export default router;
