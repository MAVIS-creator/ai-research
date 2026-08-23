# ⚡ PulseWatch

Self-hosted uptime monitoring with a real-time dashboard and a public status page — a lightweight, privacy-friendly alternative to Pingdom/StatusPage that you own end to end.

## About this project (AI Engineering Research Experiment)

PulseWatch was developed and evaluated as part of an **AI-assisted software
engineering research experiment** exploring autonomous development workflows.

- **Primary development**: Stealth / **Ox Alpha** (autonomous implementation,
  architecture, debugging, testing, and verification)
- **Contributors**: GitHub Copilot (Ox Alpha) — pair implementation, code
  review, reliability/security hardening, and end-to-end validation during
  the second engineering phase
- **Research focus**: autonomous repository inspection, architecture
  decisions, implementation, debugging, test generation, execution and
  verification, autonomous error recovery, security reasoning, UI/UX
  improvement, and maintainability.

Results are documented per task and are not interpreted as a direct
model-vs-model benchmark unless both models are evaluated on the same
codebase under comparable conditions.

## What it does

PulseWatch periodically checks your HTTP endpoints, records the results, automatically opens and resolves **incidents** when endpoints go down and recover, and exposes:

- A **JWT-authenticated dashboard** for managing monitors (create, pause/resume, delete, on-demand checks, live sparklines, uptime percentages, filtering).
- A **public status page** (`/status.html`) showing overall system health, per-monitor state, uptime, and recent incidents — no login required.
- **Real-time updates** over Server-Sent Events for both views.

## Features

| Area | Details |
|---|---|
| Monitoring | HTTP/HTTPS checks (GET/HEAD), expected-status matching, configurable 10s–1h intervals, per-monitor timeouts (500ms–30s) |
| Incident engine | Hysteresis: configurable failure/recovery thresholds (1–10); degraded state between healthy and down; transactional open/resolve so concurrent workers cannot corrupt state |
| Failure reasons | Classified errors: DNS failure, connection refused/reset, timeout, TLS certificate errors (expired, self-signed, hostname mismatch) |
| Incident engine | Transactional open-on-first-failure / resolve-on-recovery; repeated failures update the open incident instead of duplicating it |
| Scheduling | Background worker ticks on an interval, finds due monitors via SQL, runs checks concurrently with per-monitor in-flight locking |
| Auth | bcrypt password hashing, JWT bearer tokens, per-user monitor ownership (cross-user access returns 404, not 403, to avoid existence leaks) |
| Validation | Zod schemas at every write boundary with structured `validation_error` responses |
| Real-time | SSE streams (`/api/stream`, `/api/public/stream`) with keep-alive pings and per-user event filtering |
| Observability | Structured JSON logs (request IDs, check outcomes, lifecycle events), health endpoint |
| Security | Security headers, JSON body size limit, no stack traces in production errors, env-based secrets, in-memory rate limiting on auth endpoints (10 req/min/IP), public page sanitization (no URLs/IPs/user data) |
| Data | SQLite (WAL mode) with foreign keys, cascading deletes, and indexes for history queries |

## Architecture

```
src/
  server.js            Entry point: boots HTTP server + scheduler, graceful shutdown
  app.js               Express app: middleware, routes, static hosting, error handler
  config.js            Env-driven configuration (fails fast on missing prod secrets)
  db.js                node:sqlite setup, migrations, transaction helper
  logger.js            Structured JSON logger + request-scoped child logger
  validation.js        Zod schemas + validateBody middleware
  auth/
    authService.js     Users, bcrypt, JWT sign/verify, requireAuth middleware
    authRoutes.js      POST /api/auth/register, /api/auth/login
  monitors/
    monitorStore.js    Monitor CRUD + due-monitor query
    checker.js         HTTP check execution + transactional check/incident recording
    incidentStore.js   Incident queries, uptime %, recent checks
    scheduler.js       Background tick loop with in-flight dedup
    events.js          In-process EventEmitter bus
    monitorRoutes.js   /api/monitors CRUD + check/checks/incidents endpoints
    streamRoutes.js    Authenticated SSE stream
  publicStatus/
    publicStatusRoutes.js  Public /api/public/status + SSE (unauthenticated)
public/                Vanilla JS/CSS frontend (dashboard + status page)
scripts/seed.js        Demo data seeder
tests/                 Vitest + Supertest API and validation suites
```

**Stack:** Node.js ≥ 20 (built-in `node:sqlite` — no native compilation needed), Express, Zod, bcryptjs, jsonwebtoken, Vitest + Supertest. Zero build step; the frontend is dependency-free vanilla JS.

## Setup

```bash
npm install
npm run seed     # optional: demo user + monitors + synthetic history
npm start        # serves on http://localhost:3000
```

Demo login after seeding: `demo@pulsewatch.dev` / `demo-password-123`

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Set to `production` for prod hardening |
| `DB_FILE` | `data/pulsewatch.db` | SQLite database path |
| `JWT_SECRET` | dev-only default | **Required in production** — server refuses to boot without it |
| `JWT_EXPIRES_IN` | `12h` | Token lifetime |
| `BCRYPT_ROUNDS` | `4` dev / `12` prod | Password hashing cost |
| `WORKER_INTERVAL_MS` | `10000` | Scheduler tick interval |
| `CHECK_TIMEOUT_MS` | `8000` | Per-check HTTP timeout |
| `MAX_INCIDENTS_RETAINED` | `500` | Retention hint |
| `LOG_LEVEL` | `debug`/`info` | `debug`, `info`, `warn`, `error` |

## API

All authenticated routes take `Authorization: Bearer <token>`.

```
POST   /api/auth/register        { email, password }        → 201 { token, user }
POST   /api/auth/login           { email, password }        → 200 { token, user }
GET    /api/health                                          → 200 { status }
GET    /api/monitors                                        → 200 { monitors[] } (incl. uptime24h, openIncident, recentChecks)
POST   /api/monitors             { name, url, method?, expectedStatus?, intervalSeconds?, enabled? } → 201
GET    /api/monitors/:id                                    → 200 { monitor, uptime24h, uptime7d, recentChecks, incidents }
PATCH  /api/monitors/:id         (any subset of create fields) → 200
DELETE /api/monitors/:id                                    → 204 (cascades checks + incidents)
POST   /api/monitors/:id/check                              → 200 { result, outcome } (on-demand check)
GET    /api/monitors/:id/checks?limit=50                    → 200 { checks[] }
GET    /api/monitors/:id/incidents?open=true                → 200 { incidents[] }
GET    /api/stream?token=<jwt>                              → SSE `check` events
GET    /api/public/status                                   → 200 { overall, monitors[], recentIncidents[] }
GET    /api/public/stream                                   → SSE `check` events (public)
```

Errors are structured: `{ error: code, message?, details? }` with `validation_error` including per-field `details`.

## Testing

```bash
npm test
```

20 tests cover: health, auth (registration conflicts, structured validation errors, credential-failure indistinguishability, token rejection/tampering), monitor CRUD, ownership isolation, URL/interval validation, live on-demand checks against a real HTTP target, incident open/dedupe/resolve transitions, uptime computation, and the public status aggregation.

## Known limitations

- **Single process**: the scheduler and SSE bus are in-process; run one instance per database (no horizontal scaling).
- **No notification channels** yet (email/Slack/webhooks) — incidents are visible in the UI and API only.
- **Public page is global**: the status page shows all monitors; there is no per-tenant public page segmentation.
- **No check history pruning**: `checks` grows unbounded (indexes keep queries fast; add a retention job for long-running deployments).
- **JWT revocation**: tokens are stateless; there is no logout blacklist.
- **node:sqlite** requires Node ≥ 22.5 (built-in flag-free since 24).
