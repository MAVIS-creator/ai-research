import { Router } from 'express';
import { subscribe } from './events.js';
import { requireAuth } from '../auth/authService.js';

const router = Router();

/**
 * Server-Sent Events stream of live check results.
 * Auth: either the standard Authorization header (EventSource cannot set
 * headers in browsers, so a token query param is also accepted).
 */
router.get('/stream', (req, res, next) => {
  const token = req.query.token ?? (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing token' });
  }
  // Reuse the JWT verification path by faking the header for requireAuth.
  req.headers.authorization = `Bearer ${token}`;
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    openStream(req, res);
  });
});

function openStream(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(`retry: 3000\n\n`);
  res.write(`event: hello\ndata: ${JSON.stringify({ userId: req.user.id })}\n\n`);

  // Only forward events for monitors owned by this user.
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
}

export default router;
