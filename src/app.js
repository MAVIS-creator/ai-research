import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import { requestLogger, logger } from './logger.js';
import authRoutes from './auth/authRoutes.js';
import monitorRoutes from './monitors/monitorRoutes.js';
import streamRoutes from './monitors/streamRoutes.js';
import publicStatusRoutes from './publicStatus/publicStatusRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  // Minimal security headers (helmet-lite without extra deps).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', env: config.env, uptimeSec: Math.round(process.uptime()) });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/monitors', monitorRoutes);
  app.use('/api/stream', streamRoutes);
  app.use('/api/public', publicStatusRoutes);

  // Static frontend
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));
    app.use(express.static(publicDir));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  }

  // 404 for unknown API routes
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  // Central error handler — structured, no stack leakage in prod.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status ?? 500;
    req.log?.error('unhandled_error', { error: err.message, stack: err.stack });
    res.status(status).json({
      error: status === 500 ? 'internal_error' : err.code ?? 'request_error',
      message: config.isProd && status === 500 ? 'Internal server error' : err.message,
    });
  });

  return app;
}
