import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function int(name, def) {
  const v = process.env[name];
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be an integer, got "${v}"`);
  return n;
}

function required(name, devDefault) {
  const v = process.env[name] ?? devDefault;
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd,
  port: int('PORT', 3000),
  dbFile: process.env.DB_FILE
    ? path.resolve(process.env.DB_FILE)
    : path.join(root, 'data', 'pulsewatch.db'),
  // In production a JWT secret MUST be provided; dev gets a fixed default.
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  bcryptRounds: int('BCRYPT_ROUNDS', isProd ? 12 : 4),
  workerIntervalMs: int('WORKER_INTERVAL_MS', 10_000),
  checkTimeoutMs: int('CHECK_TIMEOUT_MS', 8_000),
  maxIncidentsRetained: int('MAX_INCIDENTS_RETAINED', 500),
  checkRetentionDays: int('CHECK_RETENTION_DAYS', 30),
  logLevel: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
};

export default config;
