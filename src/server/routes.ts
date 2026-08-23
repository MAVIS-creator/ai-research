import { Router, Request, Response } from 'express';
import { WorkflowEngine } from '../engine/WorkflowEngine';
import { ToolRegistry } from '../agents/ToolRegistry';
import { requireRole } from './auth';
import { z } from 'zod';

export function createApiRouter(engine: WorkflowEngine, toolRegistry: ToolRegistry): Router {
  const router = Router();

  // Health Check
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'HEALTHY',
      service: 'NexusFlow Engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Metrics Endpoint
  router.get('/metrics', (req: Request, res: Response) => {
    const metrics = engine.getMetrics();
    res.json(metrics);
  });

  // List Workflows
  router.get('/workflows', (req: Request, res: Response) => {
    const workflows = engine.listWorkflows().map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      version: w.version,
      tags: w.tags || [],
      stepsCount: w.steps.length,
      steps: w.steps.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        dependencies: s.dependencies,
        hasCompensation: Boolean(s.compensation),
        hasApprovalGate: Boolean(s.approvalGate),
        hasAgent: Boolean(s.agentConfig),
      })),
    }));
    res.json({ workflows });
  });

  // Get Workflow Definition
  router.get('/workflows/:id', (req: Request, res: Response) => {
    const workflow = engine.getWorkflow(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: `Workflow "${req.params.id}" not found.` });
    }
    res.json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      tags: workflow.tags || [],
      steps: workflow.steps.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        dependencies: s.dependencies,
        hasCompensation: Boolean(s.compensation),
        approvalGate: s.approvalGate,
        agentConfig: s.agentConfig,
        retryPolicy: s.retryPolicy,
      })),
    });
  });

  // Trigger Workflow Execution (requires OPERATOR or ADMIN)
  const TriggerSchema = z.object({
    workflowId: z.string(),
    initialState: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
  });

  router.post('/executions', requireRole(['ADMIN', 'OPERATOR']), async (req: Request, res: Response) => {
    const parseResult = TriggerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.format() });
    }

    try {
      const execution = await engine.execute(
        parseResult.data.workflowId,
        parseResult.data.initialState || {},
        { ...parseResult.data.metadata, triggeredBy: req.user?.name || 'API' }
      );
      res.status(201).json({ execution });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // List Executions
  router.get('/executions', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const executions = engine.listExecutions(limit);
    res.json({ executions });
  });

  // Get Execution Details
  router.get('/executions/:id', (req: Request, res: Response) => {
    const execution = engine.getExecution(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: `Execution "${req.params.id}" not found.` });
    }

    const events = engine.journal.getEvents(req.params.id);
    const snapshots = engine.journal.getSnapshots(req.params.id);

    res.json({
      execution,
      events,
      snapshotsCount: snapshots.length,
    });
  });

  // Time-Travel Replay Snapshot
  router.get('/executions/:id/replay/:seq', (req: Request, res: Response) => {
    const seq = parseInt(req.params.seq, 10);
    if (isNaN(seq)) {
      return res.status(400).json({ error: 'Invalid sequence number' });
    }

    const snapshot = engine.journal.replayToSequence(req.params.id, seq);
    if (!snapshot) {
      return res.status(404).json({ error: `No events found for sequence ${seq}` });
    }

    res.json({ snapshot });
  });

  // List Pending Approvals
  router.get('/approvals', (req: Request, res: Response) => {
    const approvals = engine.approvalManager.getPendingApprovals();
    res.json({ approvals });
  });

  // Submit Approval Decision (requires OPERATOR or ADMIN)
  const ApprovalDecisionSchema = z.object({
    executionId: z.string(),
    stepId: z.string(),
    gateId: z.string(),
    decision: z.enum(['APPROVE', 'REJECT']),
    inputData: z.record(z.any()).optional(),
    comment: z.string().optional(),
  });

  router.post('/approvals/decision', requireRole(['ADMIN', 'OPERATOR']), (req: Request, res: Response) => {
    const parsed = ApprovalDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid approval decision', details: parsed.error.format() });
    }

    try {
      const success = engine.submitApproval({
        ...parsed.data,
        approver: req.user?.name || 'Operator',
        role: req.user?.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
      });

      if (!success) {
        return res.status(404).json({ error: 'No matching pending approval gate found' });
      }

      res.json({ success: true, message: `Decision ${parsed.data.decision} submitted successfully.` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Dead-Letter Queue (DLQ)
  router.get('/dlq', (req: Request, res: Response) => {
    const dlq = engine.getDLQ();
    res.json({ dlq, depth: dlq.length });
  });

  // Re-drive DLQ Execution (requires ADMIN)
  router.post('/dlq/redrive/:executionId', requireRole(['ADMIN']), async (req: Request, res: Response) => {
    try {
      const execution = await engine.redriveDLQ(req.params.executionId);
      res.json({ success: true, message: 'Execution re-driven successfully', execution });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Tools Registry Info
  router.get('/agents/tools', (req: Request, res: Response) => {
    const tools = toolRegistry.listTools();
    res.json({ tools });
  });

  return router;
}
