import config from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, msg, fields = {}) {
  if ((LEVELS[level] ?? 0) < threshold) return;
  const rec = { ts: new Date().toISOString(), level, msg, ...fields };
  const line = JSON.stringify(rec);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg, fields) => emit('debug', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields),
};

/** Express request-scoped child logger with a request id. */
export function requestLogger(req, res, next) {
  req.id = crypto.randomUUID();
  req.log = {
    debug: (m, f) => logger.debug(m, { requestId: req.id, ...f }),
    info: (m, f) => logger.info(m, { requestId: req.id, ...f }),
    warn: (m, f) => logger.warn(m, { requestId: req.id, ...f }),
    error: (m, f) => logger.error(m, { requestId: req.id, ...f }),
  };
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http_request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
}
