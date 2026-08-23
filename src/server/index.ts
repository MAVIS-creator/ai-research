import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { WorkflowEngine } from '../engine/WorkflowEngine';
import { ToolRegistry } from '../agents/ToolRegistry';
import { authMiddleware } from './auth';
import { RateLimiter } from './rateLimiter';
import { createApiRouter } from './routes';
import { createIncidentRemediationWorkflow } from '../scenarios/incidentRemediation';
import { createResearchSwarmWorkflow } from '../scenarios/researchSwarm';
import { createOrderFulfillmentSagaWorkflow } from '../scenarios/orderFulfillmentSaga';
import { createSecurityTriageWorkflow } from '../scenarios/securityTriage';

export function createApp(storageDir?: string) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const toolRegistry = new ToolRegistry();
  const engine = new WorkflowEngine(storageDir);

  // Register the 4 Production Scenarios
  engine.registerWorkflow(createIncidentRemediationWorkflow(toolRegistry));
  engine.registerWorkflow(createResearchSwarmWorkflow(toolRegistry));
  engine.registerWorkflow(createOrderFulfillmentSagaWorkflow());
  engine.registerWorkflow(createSecurityTriageWorkflow(toolRegistry));

  // WebSocket Live Broadcasting
  const activeSockets = new Set<WebSocket>();

  wss.on('connection', ws => {
    activeSockets.add(ws);
    // Send initial greeting & telemetry
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'NexusFlow Realtime Mesh Connected', timestamp: Date.now() }));

    ws.on('close', () => {
      activeSockets.delete(ws);
    });

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        }
      } catch {}
    });
  });

  function broadcast(type: string, data: any) {
    const payload = JSON.stringify({ type, data, timestamp: Date.now() });
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  // Engine Event Listeners for Real-time Streaming
  engine.on('execution_started', exec => broadcast('EXECUTION_STARTED', exec));
  engine.on('execution_updated', exec => broadcast('EXECUTION_UPDATED', exec));
  engine.on('execution_completed', exec => broadcast('EXECUTION_COMPLETED', exec));
  engine.on('execution_failed', ({ execution, error }) => broadcast('EXECUTION_FAILED', { execution, error: error.message }));
  engine.on('step_log', log => broadcast('STEP_LOG', log));
  engine.on('approval_requested', app => broadcast('APPROVAL_REQUESTED', app));
  engine.on('approval_resolved', app => broadcast('APPROVAL_RESOLVED', app));
  engine.on('step_compensating', comp => broadcast('STEP_COMPENSATING', comp));
  engine.on('step_compensated', comp => broadcast('STEP_COMPENSATED', comp));

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request Logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (!req.path.startsWith('/api/metrics')) {
        console.log(`[HTTP] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });

  const rateLimiter = new RateLimiter(200, 50);
  app.use('/api', rateLimiter.middleware());
  app.use('/api', authMiddleware);

  // Mount API router
  const apiRouter = createApiRouter(engine, toolRegistry);
  app.use('/api', apiRouter);

  // Serve static files in production if dist/client exists
  const clientDist = path.join(__dirname, '../../dist/client');
  app.use(express.static(clientDist));

  return { app, server, engine, toolRegistry, wss };
}

// Auto-start if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  const storageDir = path.join(process.cwd(), '.nexusflow-journal');
  const { server, engine } = createApp(storageDir);

  server.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`   NexusFlow Durable Workflow & Multi-Agent Platform  `);
    console.log(`======================================================`);
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`WebSocket Stream on  ws://localhost:${PORT}/ws`);
    console.log(`Journal directory:   ${storageDir}`);
    console.log(`Registered Workflows: ${engine.listWorkflows().length}`);
    console.log(`Ready for real-time orchestration & mission control.\n`);

    // Seed an initial scenario to populate immediate visual graph
    console.log('Seeding initial demonstration scenario...');
    try {
      await engine.execute('wf_research_swarm', { topic: 'High-Throughput Global Event Streaming' });
    } catch (e) {
      console.warn('Initial demo seed error:', e);
    }
  });
}
