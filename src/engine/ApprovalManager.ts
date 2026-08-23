import { ApprovalGate, ApprovalDecision, WorkflowExecution } from '../types';
import { EventEmitter } from 'events';

export interface PendingApprovalInfo {
  executionId: string;
  stepId: string;
  gate: ApprovalGate;
  requestedAt: number;
  timeoutAt?: number;
  resolve: (decision: ApprovalDecision) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

export class ApprovalManager extends EventEmitter {
  private pendingApprovals: Map<string, PendingApprovalInfo> = new Map(); // key: `${executionId}:${stepId}`

  /**
   * Request human-in-the-loop approval. Returns a Promise that resolves when approved/rejected.
   */
  public requestApproval(
    executionId: string,
    stepId: string,
    gate: ApprovalGate
  ): Promise<ApprovalDecision> {
    const key = `${executionId}:${stepId}`;

    return new Promise<ApprovalDecision>((resolve, reject) => {
      const requestedAt = Date.now();
      const timeoutAt = gate.timeoutMs ? requestedAt + gate.timeoutMs : undefined;

      let timer: NodeJS.Timeout | undefined;
      if (gate.timeoutMs && gate.fallbackAction) {
        timer = setTimeout(() => {
          this.handleTimeout(key);
        }, gate.timeoutMs);
      }

      const info: PendingApprovalInfo = {
        executionId,
        stepId,
        gate,
        requestedAt,
        timeoutAt,
        resolve,
        reject,
        timer,
      };

      this.pendingApprovals.set(key, info);
      this.emit('approval_requested', { executionId, stepId, gate, requestedAt, timeoutAt });
    });
  }

  /**
   * Submit an approval decision.
   */
  public submitDecision(decision: ApprovalDecision): boolean {
    const key = `${decision.executionId}:${decision.stepId}` || this.findKeyByGate(decision);
    if (!key || !this.pendingApprovals.has(key)) {
      return false;
    }

    const pending = this.pendingApprovals.get(key)!;
    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    // Role check
    if (pending.gate.requiredRole !== 'ANY' && decision.role !== 'ADMIN' && decision.role !== pending.gate.requiredRole) {
      throw new Error(`Unauthorized: Approval requires role "${pending.gate.requiredRole}", but user has role "${decision.role}"`);
    }

    this.pendingApprovals.delete(key);
    this.emit('approval_resolved', { decision, gate: pending.gate });
    pending.resolve(decision);
    return true;
  }

  /**
   * Get all currently pending approvals.
   */
  public getPendingApprovals(): Array<{
    key: string;
    executionId: string;
    stepId: string;
    gate: ApprovalGate;
    requestedAt: number;
    timeoutAt?: number;
  }> {
    return Array.from(this.pendingApprovals.entries()).map(([key, info]) => ({
      key,
      executionId: info.executionId,
      stepId: info.stepId,
      gate: info.gate,
      requestedAt: info.requestedAt,
      timeoutAt: info.timeoutAt,
    }));
  }

  public cancelPendingForExecution(executionId: string): void {
    for (const [key, info] of this.pendingApprovals.entries()) {
      if (info.executionId === executionId) {
        if (info.timer) clearTimeout(info.timer);
        info.reject(new Error(`Execution ${executionId} was cancelled`));
        this.pendingApprovals.delete(key);
      }
    }
  }

  private handleTimeout(key: string): void {
    const pending = this.pendingApprovals.get(key);
    if (!pending) return;

    this.pendingApprovals.delete(key);
    const fallback = pending.gate.fallbackAction || 'AUTO_REJECT';

    const decision: ApprovalDecision = {
      gateId: pending.gate.gateId,
      stepId: pending.stepId,
      decision: fallback === 'AUTO_APPROVE' ? 'APPROVE' : 'REJECT',
      approver: 'SYSTEM_TIMEOUT_FALLBACK',
      role: 'ADMIN',
      comment: `Approval timed out after ${pending.gate.timeoutMs}ms. Fallback action: ${fallback}`,
    };

    this.emit('approval_resolved', { decision, gate: pending.gate, timedOut: true });
    pending.resolve(decision);
  }

  private findKeyByGate(decision: any): string | null {
    for (const [key, info] of this.pendingApprovals.entries()) {
      if (info.gate.gateId === decision.gateId && (!decision.executionId || info.executionId === decision.executionId)) {
        return key;
      }
    }
    return null;
  }
}
