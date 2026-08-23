/**
 * NexusFlow Type Definitions
 * Distributed-Resilient Multi-Agent & Saga Workflow Orchestration Engine
 */

export type ExecutionStatus = 
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'CANCELLED';

export type StepStatus = 
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'
  | 'SKIPPED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'COMPENSATION_FAILED';

export type StepType = 
  | 'TASK'
  | 'AGENT'
  | 'PARALLEL_GROUP'
  | 'APPROVAL_GATE'
  | 'CONDITION'
  | 'DELAY'
  | 'WEBHOOK';

export interface RetryPolicy {
  maxAttempts: number;
  initialIntervalMs: number;
  maxIntervalMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: string[];
}

export interface ApprovalGate {
  gateId: string;
  title: string;
  description: string;
  requiredRole: 'ADMIN' | 'OPERATOR' | 'ANY';
  timeoutMs?: number;
  fallbackAction?: 'AUTO_APPROVE' | 'AUTO_REJECT';
  inputSchema?: Record<string, { type: 'string' | 'number' | 'boolean' | 'json'; label: string; required?: boolean; default?: any }>;
}

export interface AgentTaskConfig {
  agentId: string;
  role: string;
  goal: string;
  systemPrompt?: string;
  tools: string[];
  maxIterations?: number;
  guardrails?: {
    maskPii?: boolean;
    maxTokens?: number;
    requireToolConfirmation?: boolean;
  };
}

export interface StepExecutionContext {
  executionId: string;
  stepId: string;
  workflowId: string;
  attempt: number;
  state: Record<string, any>;
  stepOutputs: Record<string, any>;
  log: (message: string, level?: 'info' | 'warn' | 'error' | 'debug', data?: any) => void;
  reportProgress: (progressPercent: number, details?: string) => void;
  signal: AbortSignal;
}

export interface StepCompensationContext {
  executionId: string;
  stepId: string;
  workflowId: string;
  stepOutput: any;
  state: Record<string, any>;
  error: Error;
  log: (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;
}

export type StepExecuteFn = (ctx: StepExecutionContext) => Promise<any>;
export type StepCompensateFn = (ctx: StepCompensationContext) => Promise<any>;
export type StepConditionFn = (state: Record<string, any>, stepOutputs: Record<string, any>) => boolean;

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  dependencies: string[]; // Step IDs that must complete before this step
  execute: StepExecuteFn;
  compensation?: StepCompensateFn;
  retryPolicy?: RetryPolicy;
  approvalGate?: ApprovalGate;
  agentConfig?: AgentTaskConfig;
  timeoutMs?: number;
  condition?: StepConditionFn;
  parallelBranches?: WorkflowStep[][]; // for nested parallel groups
  metadata?: Record<string, any>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  defaultTimeoutMs?: number;
  steps: WorkflowStep[];
  tags?: string[];
  metadata?: Record<string, any>;
}

export type EventType =
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_STATUS_CHANGED'
  | 'STEP_QUEUED'
  | 'STEP_STARTED'
  | 'STEP_PROGRESS'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'STEP_RETRYING'
  | 'STEP_SKIPPED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_RESOLVED'
  | 'COMPENSATION_TRIGGERED'
  | 'STEP_COMPENSATING'
  | 'STEP_COMPENSATED'
  | 'STEP_COMPENSATION_FAILED'
  | 'WORKFLOW_COMPENSATED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_CANCELLED'
  | 'AGENT_THOUGHT'
  | 'AGENT_TOOL_CALL'
  | 'AGENT_TOOL_RESULT'
  | 'AGENT_COMPLETED';

export interface WorkflowEvent {
  eventId: string;
  executionId: string;
  workflowId: string;
  timestamp: number;
  sequenceNumber: number;
  type: EventType;
  stepId?: string;
  payload: any;
  error?: { message: string; stack?: string; code?: string };
}

export interface StepExecutionRecord {
  stepId: string;
  name: string;
  type: StepType;
  status: StepStatus;
  attempt: number;
  startTime?: number;
  endTime?: number;
  durationMs?: number;
  progress: number;
  output?: any;
  error?: string;
  compensated: boolean;
  compensationError?: string;
  logs: Array<{ timestamp: number; level: string; message: string; data?: any }>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  initialState: Record<string, any>;
  currentState: Record<string, any>;
  stepOutputs: Record<string, any>;
  steps: Record<string, StepExecutionRecord>;
  pendingApproval?: {
    gateId: string;
    stepId: string;
    title: string;
    description: string;
    requiredRole: string;
    requestedAt: number;
    timeoutAt?: number;
    inputSchema?: Record<string, any>;
  };
  startTime: number;
  endTime?: number;
  durationMs?: number;
  error?: string;
  eventsCount: number;
  traceId: string;
  metadata?: Record<string, any>;
}

export interface ApprovalDecision {
  gateId: string;
  stepId: string;
  decision: 'APPROVE' | 'REJECT';
  approver: string;
  role: 'ADMIN' | 'OPERATOR';
  inputData?: Record<string, any>;
  comment?: string;
}

export interface TimeTravelSnapshot {
  sequenceNumber: number;
  timestamp: number;
  eventType: EventType;
  executionStatus: ExecutionStatus;
  activeStepId?: string;
  stateSnapshot: Record<string, any>;
  stepOutputsSnapshot: Record<string, any>;
  stepStatuses: Record<string, StepStatus>;
  eventDescription: string;
}

export interface SystemMetrics {
  totalExecutions: number;
  activeExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  compensatedExecutions: number;
  throughputOpsSec: number;
  latenciesMs: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  dlqDepth: number;
  activeWorkers: number;
  activeApprovalsCount: number;
  uptimeSeconds: number;
  agentTokenUsage: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: any, context?: any) => Promise<any>;
}

export interface AgentReasoningStep {
  agentId: string;
  iteration: number;
  thought: string;
  toolCall?: {
    toolName: string;
    parameters: any;
  };
  observation?: any;
  timestamp: number;
}
