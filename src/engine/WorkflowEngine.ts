import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStep,
  ExecutionStatus,
  StepStatus,
  StepExecutionContext,
  WorkflowEvent,
  SystemMetrics,
  ApprovalDecision,
} from '../types';
import { DAGResolver } from './DAGResolver';
import { DurableJournal } from './DurableJournal';
import { RetryEvaluator, DEFAULT_RETRY_POLICY } from './RetryPolicy';
import { SagaManager } from './SagaManager';
import { ApprovalManager } from './ApprovalManager';

export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private dlq: Array<{ executionId: string; workflowId: string; error: string; timestamp: number; payload: any }> = [];
  
  public readonly journal: DurableJournal;
  public readonly sagaManager: SagaManager;
  public readonly approvalManager: ApprovalManager;

  private completedLatencies: number[] = [];
  private totalTokensUsed = { totalTokens: 0, promptTokens: 0, completionTokens: 0 };
  private startTime = Date.now();
  private storageDir: string | null = null;

  constructor(storageDir?: string) {
    super();
    this.storageDir = storageDir || path.join(process.cwd(), '.nexusflow-journal');
    this.journal = new DurableJournal(this.storageDir);
    this.sagaManager = new SagaManager(this.journal);
    this.approvalManager = new ApprovalManager();

    // Auto-recover existing state from disk journal if available
    this.recoverFromDiskJournal();

    // Forward saga events
    this.sagaManager.on('step_compensating', evt => this.emit('step_compensating', evt));
    this.sagaManager.on('step_compensated', evt => this.emit('step_compensated', evt));
    this.sagaManager.on('step_compensation_failed', evt => this.emit('step_compensation_failed', evt));

    // Forward approval events
    this.approvalManager.on('approval_requested', evt => {
      const exec = this.executions.get(evt.executionId);
      if (exec) {
        exec.status = 'PAUSED_APPROVAL';
        exec.pendingApproval = {
          gateId: evt.gate.gateId,
          stepId: evt.stepId,
          title: evt.gate.title,
          description: evt.gate.description,
          requiredRole: evt.gate.requiredRole,
          requestedAt: evt.requestedAt,
          timeoutAt: evt.timeoutAt,
          inputSchema: evt.gate.inputSchema,
        };
        this.journal.append({
          executionId: exec.id,
          workflowId: exec.workflowId,
          stepId: evt.stepId,
          type: 'APPROVAL_REQUESTED',
          payload: exec.pendingApproval,
        });
        this.recordSnapshot(exec, 'APPROVAL_REQUESTED', evt.stepId);
        this.emit('execution_updated', exec);
      }
      this.emit('approval_requested', evt);
    });

    this.approvalManager.on('approval_resolved', evt => {
      const exec = this.executions.get(evt.decision.executionId || '');
      if (exec && exec.pendingApproval) {
        exec.pendingApproval = undefined;
        this.journal.append({
          executionId: exec.id,
          workflowId: exec.workflowId,
          stepId: evt.decision.stepId,
          type: 'APPROVAL_RESOLVED',
          payload: evt.decision,
        });
        this.recordSnapshot(exec, 'APPROVAL_RESOLVED', evt.decision.stepId);
        this.emit('execution_updated', exec);
      }
      this.emit('approval_resolved', evt);
    });
  }

  /**
   * Recover past execution records from disk journal files on startup.
   */
  private recoverFromDiskJournal(): void {
    if (!this.storageDir || !fs.existsSync(this.storageDir)) return;

    try {
      const files = fs.readdirSync(this.storageDir).filter(f => f.endsWith('.journal.jsonl'));
      for (const file of files) {
        const execId = file.replace('.journal.jsonl', '');
        const filePath = path.join(this.storageDir, file);
        const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const event: WorkflowEvent = JSON.parse(line);
            this.journal.appendFromRecovered(event);

            // Reconstruct in-memory execution object
            if (event.type === 'WORKFLOW_STARTED') {
              this.executions.set(execId, {
                id: execId,
                workflowId: event.workflowId,
                workflowName: event.workflowId,
                status: 'RUNNING',
                initialState: event.payload?.initialState || {},
                currentState: event.payload?.initialState || {},
                stepOutputs: {},
                steps: {},
                startTime: event.timestamp,
                eventsCount: 1,
                traceId: event.payload?.traceId || `trc_${execId}`,
              });
            } else if (this.executions.has(execId)) {
              const exec = this.executions.get(execId)!;
              exec.eventsCount++;

              if (event.type === 'STEP_STARTED' && event.stepId) {
                if (!exec.steps[event.stepId]) {
                  exec.steps[event.stepId] = {
                    stepId: event.stepId,
                    name: event.stepId,
                    type: 'TASK',
                    status: 'RUNNING',
                    attempt: 1,
                    progress: 0,
                    compensated: false,
                    logs: [],
                  };
                }
                exec.steps[event.stepId].status = 'RUNNING';
              } else if (event.type === 'STEP_COMPLETED' && event.stepId) {
                if (exec.steps[event.stepId]) {
                  exec.steps[event.stepId].status = 'COMPLETED';
                  exec.steps[event.stepId].output = event.payload?.output;
                  exec.stepOutputs[event.stepId] = event.payload?.output;
                }
              } else if (event.type === 'WORKFLOW_COMPLETED') {
                exec.status = 'COMPLETED';
                exec.endTime = event.timestamp;
                exec.durationMs = event.payload?.durationMs || (exec.endTime - exec.startTime);
                this.completedLatencies.push(exec.durationMs);
              } else if (event.type === 'WORKFLOW_COMPENSATED') {
                exec.status = 'COMPENSATED';
                exec.endTime = event.timestamp;
                exec.durationMs = event.payload?.durationMs || (exec.endTime - exec.startTime);
              } else if (event.type === 'WORKFLOW_FAILED') {
                exec.status = 'FAILED';
                exec.endTime = event.timestamp;
                exec.durationMs = exec.endTime - exec.startTime;
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('Journal recovery warning:', err);
    }
  }

  public registerWorkflow(workflow: WorkflowDefinition): void {
    const validation = DAGResolver.validate(workflow.steps);
    if (!validation.isValid) {
      throw new Error(`Invalid workflow "${workflow.name}": ${validation.errors.join('; ')}`);
    }
    this.workflows.set(workflow.id, workflow);
    this.emit('workflow_registered', workflow);
  }

  public getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  public listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  public async execute(
    workflowId: string,
    initialState: Record<string, any> = {},
    metadata: Record<string, any> = {}
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow with ID "${workflowId}" not found.`);
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const traceId = `trc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      workflowName: workflow.name,
      status: 'RUNNING',
      initialState: { ...initialState },
      currentState: { ...initialState },
      stepOutputs: {},
      steps: {},
      startTime: Date.now(),
      eventsCount: 0,
      traceId,
      metadata,
    };

    for (const step of workflow.steps) {
      execution.steps[step.id] = {
        stepId: step.id,
        name: step.name,
        type: step.type,
        status: 'PENDING',
        attempt: 0,
        progress: 0,
        compensated: false,
        logs: [],
      };
    }

    this.executions.set(executionId, execution);

    this.journal.append({
      executionId,
      workflowId,
      type: 'WORKFLOW_STARTED',
      payload: { initialState, metadata, traceId },
    });

    this.recordSnapshot(execution, 'WORKFLOW_STARTED');
    this.emit('execution_started', execution);

    // Launch async execution loop without blocking caller
    this.runExecutionLoop(execution, workflow).catch(err => {
      console.error(`Unhandled execution loop error for ${executionId}:`, err);
    });

    return execution;
  }

  private async runExecutionLoop(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition
  ): Promise<void> {
    const completedStepIds = new Set<string>();
    const runningStepIds = new Set<string>();
    const failedStepIds = new Set<string>();
    const skippedStepIds = new Set<string>();

    const executionAbortController = new AbortController();

    while (execution.status === 'RUNNING' || execution.status === 'PAUSED_APPROVAL') {
      const readySteps = DAGResolver.getReadySteps(
        workflow.steps,
        completedStepIds,
        runningStepIds,
        failedStepIds,
        skippedStepIds
      );

      const totalSteps = workflow.steps.length;
      const settledCount = completedStepIds.size + failedStepIds.size + skippedStepIds.size;

      if (settledCount === totalSteps && runningStepIds.size === 0) {
        execution.status = 'COMPLETED';
        execution.endTime = Date.now();
        execution.durationMs = execution.endTime - execution.startTime;
        this.completedLatencies.push(execution.durationMs);

        this.journal.append({
          executionId: execution.id,
          workflowId: workflow.id,
          type: 'WORKFLOW_COMPLETED',
          payload: {
            durationMs: execution.durationMs,
            finalState: execution.currentState,
            stepOutputs: execution.stepOutputs,
          },
        });

        this.recordSnapshot(execution, 'WORKFLOW_COMPLETED');
        this.emit('execution_completed', execution);
        this.emit('execution_updated', execution);
        break;
      }

      if (readySteps.length === 0 && runningStepIds.size === 0) {
        if (failedStepIds.size > 0) break;
        execution.status = 'COMPLETED';
        execution.endTime = Date.now();
        execution.durationMs = execution.endTime - execution.startTime;
        this.completedLatencies.push(execution.durationMs);
        this.recordSnapshot(execution, 'WORKFLOW_COMPLETED');
        this.emit('execution_completed', execution);
        this.emit('execution_updated', execution);
        break;
      }

      if (readySteps.length > 0) {
        const stepPromises = readySteps.map(async step => {
          runningStepIds.add(step.id);
          try {
            await this.executeStepWithRetries(execution, workflow, step, executionAbortController.signal);
            runningStepIds.delete(step.id);
            if (execution.steps[step.id].status === 'COMPLETED') {
              completedStepIds.add(step.id);
            } else if (execution.steps[step.id].status === 'SKIPPED') {
              skippedStepIds.add(step.id);
            }
          } catch (stepErr: any) {
            runningStepIds.delete(step.id);
            failedStepIds.add(step.id);
            // Immediately abort all concurrent sibling steps to prevent zombie execution & state mutation
            executionAbortController.abort();
            throw stepErr;
          }
        });

        try {
          await Promise.all(stepPromises);
        } catch (error: any) {
          // Trigger Saga Compensation Rollback
          await this.handleWorkflowFailure(execution, workflow, error);
          break;
        }
      } else {
        await new Promise(res => setTimeout(res, 30));
      }
    }
  }

  private async executeStepWithRetries(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    step: WorkflowStep,
    parentSignal?: AbortSignal
  ): Promise<void> {
    const stepRecord = execution.steps[step.id];

    if (parentSignal?.aborted) {
      stepRecord.status = 'SKIPPED';
      throw new Error(`Execution was aborted due to sibling step failure`);
    }

    if (step.condition) {
      const shouldRun = step.condition(execution.currentState, execution.stepOutputs);
      if (!shouldRun) {
        stepRecord.status = 'SKIPPED';
        this.journal.append({
          executionId: execution.id,
          workflowId: workflow.id,
          stepId: step.id,
          type: 'STEP_SKIPPED',
          payload: { reason: 'condition_false' },
        });
        this.recordSnapshot(execution, 'STEP_SKIPPED', step.id);
        this.emit('execution_updated', execution);
        return;
      }
    }

    if (step.approvalGate) {
      stepRecord.status = 'WAITING_APPROVAL';
      this.emit('execution_updated', execution);

      const decision = await this.approvalManager.requestApproval(
        execution.id,
        step.id,
        step.approvalGate
      );

      if (decision.decision === 'REJECT') {
        stepRecord.status = 'FAILED';
        stepRecord.error = `Approval rejected by ${decision.approver}: ${decision.comment || 'No reason provided'}`;
        throw new Error(stepRecord.error);
      }

      if (decision.inputData) {
        Object.assign(execution.currentState, decision.inputData);
      }
    }

    const retryPolicy = step.retryPolicy || DEFAULT_RETRY_POLICY;
    let attempt = 0;
    let success = false;

    stepRecord.startTime = Date.now();

    while (!success) {
      if (parentSignal?.aborted) {
        stepRecord.status = 'SKIPPED';
        throw new Error(`Step aborted by parent execution signal`);
      }

      attempt++;
      stepRecord.attempt = attempt;
      stepRecord.status = 'RUNNING';

      this.journal.append({
        executionId: execution.id,
        workflowId: workflow.id,
        stepId: step.id,
        type: 'STEP_STARTED',
        payload: { attempt },
      });

      this.recordSnapshot(execution, 'STEP_STARTED', step.id);
      this.emit('execution_updated', execution);

      const abortController = new AbortController();
      let timeoutTimer: NodeJS.Timeout | undefined;

      const timeoutMs = step.timeoutMs || workflow.defaultTimeoutMs;
      if (timeoutMs) {
        timeoutTimer = setTimeout(() => {
          abortController.abort();
        }, timeoutMs);
      }

      const ctx: StepExecutionContext = {
        executionId: execution.id,
        stepId: step.id,
        workflowId: workflow.id,
        attempt,
        state: execution.currentState,
        stepOutputs: execution.stepOutputs,
        log: (msg, level = 'info', data) => {
          stepRecord.logs.push({ timestamp: Date.now(), level, message: msg, data });
          this.emit('step_log', { executionId: execution.id, stepId: step.id, level, message: msg });
        },
        reportProgress: (pct, details) => {
          stepRecord.progress = Math.min(100, Math.max(0, pct));
          this.journal.append({
            executionId: execution.id,
            workflowId: workflow.id,
            stepId: step.id,
            type: 'STEP_PROGRESS',
            payload: { progress: stepRecord.progress, details },
          });
          this.emit('execution_updated', execution);
        },
        signal: abortController.signal,
      };

      try {
        const output = await step.execute(ctx);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        if (parentSignal?.aborted) {
          throw new Error('Aborted by sibling error');
        }

        stepRecord.status = 'COMPLETED';
        stepRecord.endTime = Date.now();
        stepRecord.durationMs = stepRecord.endTime - (stepRecord.startTime || stepRecord.endTime);
        stepRecord.output = output;
        stepRecord.progress = 100;

        execution.stepOutputs[step.id] = output;
        if (output && typeof output === 'object' && output.__stateUpdate) {
          Object.assign(execution.currentState, output.__stateUpdate);
        }

        this.journal.append({
          executionId: execution.id,
          workflowId: workflow.id,
          stepId: step.id,
          type: 'STEP_COMPLETED',
          payload: { output, durationMs: stepRecord.durationMs },
        });

        this.recordSnapshot(execution, 'STEP_COMPLETED', step.id);
        this.emit('execution_updated', execution);
        success = true;
      } catch (err: any) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        const shouldRetry = RetryEvaluator.shouldRetry(retryPolicy, attempt, err) && !parentSignal?.aborted;

        if (shouldRetry) {
          const delay = RetryEvaluator.calculateDelay(retryPolicy, attempt);
          stepRecord.status = 'RETRYING';
          this.journal.append({
            executionId: execution.id,
            workflowId: workflow.id,
            stepId: step.id,
            type: 'STEP_RETRYING',
            payload: { attempt, nextDelayMs: delay, error: err.message },
          });
          this.recordSnapshot(execution, 'STEP_RETRYING', step.id);
          this.emit('execution_updated', execution);
          await new Promise(res => setTimeout(res, delay));
        } else {
          stepRecord.status = 'FAILED';
          stepRecord.endTime = Date.now();
          stepRecord.durationMs = stepRecord.endTime - (stepRecord.startTime || stepRecord.endTime);
          stepRecord.error = err.message || String(err);

          this.journal.append({
            executionId: execution.id,
            workflowId: workflow.id,
            stepId: step.id,
            type: 'STEP_FAILED',
            payload: { error: err.message, attempts: attempt },
            error: { message: err.message, stack: err.stack },
          });

          this.recordSnapshot(execution, 'STEP_FAILED', step.id);
          this.emit('execution_updated', execution);
          throw err;
        }
      }
    }
  }

  private async handleWorkflowFailure(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    error: Error
  ): Promise<void> {
    execution.error = error.message;
    
    this.dlq.push({
      executionId: execution.id,
      workflowId: workflow.id,
      error: error.message,
      timestamp: Date.now(),
      payload: {
        currentState: execution.currentState,
        stepOutputs: execution.stepOutputs,
      },
    });

    await this.sagaManager.executeRollback(execution, workflow.steps, error);

    this.recordSnapshot(execution, execution.status === 'COMPENSATED' ? 'WORKFLOW_COMPENSATED' : 'WORKFLOW_FAILED');
    this.emit('execution_failed', { execution, error });
    this.emit('execution_updated', execution);
  }

  public async redriveDLQ(executionId: string): Promise<WorkflowExecution> {
    const dlqIndex = this.dlq.findIndex(item => item.executionId === executionId);
    if (dlqIndex === -1) {
      throw new Error(`Execution "${executionId}" not found in Dead-Letter Queue.`);
    }

    const [item] = this.dlq.splice(dlqIndex, 1);
    const prevExec = this.executions.get(executionId);
    const initialState = prevExec ? prevExec.initialState : item.payload?.currentState || {};

    return this.execute(item.workflowId, initialState, { redriveFrom: executionId });
  }

  public submitApproval(decision: ApprovalDecision): boolean {
    return this.approvalManager.submitDecision(decision);
  }

  public getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  public listExecutions(limit = 50): WorkflowExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  public getDLQ(): Array<{ executionId: string; workflowId: string; error: string; timestamp: number; payload: any }> {
    return [...this.dlq];
  }

  public getMetrics(): SystemMetrics {
    const allExecs = Array.from(this.executions.values());
    const totalExecutions = allExecs.length;
    const activeExecutions = allExecs.filter(e => e.status === 'RUNNING' || e.status === 'PAUSED_APPROVAL').length;
    const completedExecutions = allExecs.filter(e => e.status === 'COMPLETED').length;
    const failedExecutions = allExecs.filter(e => e.status === 'FAILED').length;
    const compensatedExecutions = allExecs.filter(e => e.status === 'COMPENSATED').length;

    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const throughputOpsSec = uptimeSeconds > 0 ? Number((totalExecutions / uptimeSeconds).toFixed(2)) : totalExecutions;

    const sortedLatencies = [...this.completedLatencies].sort((a, b) => a - b);
    const p50 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] : 0;
    const p95 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] : 0;
    const p99 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] : 0;
    const avg = sortedLatencies.length > 0 ? Math.round(sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length) : 0;

    return {
      totalExecutions,
      activeExecutions,
      completedExecutions,
      failedExecutions,
      compensatedExecutions,
      throughputOpsSec,
      latenciesMs: { p50, p95, p99, avg },
      dlqDepth: this.dlq.length,
      activeWorkers: activeExecutions * 2 + 1,
      activeApprovalsCount: this.approvalManager.getPendingApprovals().length,
      uptimeSeconds,
      agentTokenUsage: { ...this.totalTokensUsed },
    };
  }

  public trackTokens(prompt: number, completion: number): void {
    this.totalTokensUsed.promptTokens += prompt;
    this.totalTokensUsed.completionTokens += completion;
    this.totalTokensUsed.totalTokens += (prompt + completion);
  }

  private recordSnapshot(execution: WorkflowExecution, eventType: any, activeStepId?: string): void {
    execution.eventsCount++;
    const stepStatuses: Record<string, StepStatus> = {};
    for (const [id, rec] of Object.entries(execution.steps)) {
      stepStatuses[id] = rec.status;
    }

    this.journal.recordSnapshot(execution.id, {
      eventType,
      executionStatus: execution.status,
      activeStepId,
      stateSnapshot: JSON.parse(JSON.stringify(execution.currentState)),
      stepOutputsSnapshot: JSON.parse(JSON.stringify(execution.stepOutputs)),
      stepStatuses,
      eventDescription: `${eventType}${activeStepId ? ` on step ${activeStepId}` : ''}`,
    });
  }
}
