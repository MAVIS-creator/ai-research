import {
  WorkflowStep,
  WorkflowExecution,
  StepCompensationContext,
  StepStatus,
} from '../types';
import { DAGResolver } from './DAGResolver';
import { DurableJournal } from './DurableJournal';
import { EventEmitter } from 'events';

export class SagaManager extends EventEmitter {
  constructor(private journal: DurableJournal) {
    super();
  }

  /**
   * Execute saga rollback for an execution that encountered a fatal error.
   */
  public async executeRollback(
    execution: WorkflowExecution,
    steps: WorkflowStep[],
    triggeringError: Error
  ): Promise<{
    success: boolean;
    compensatedSteps: string[];
    failedCompensationSteps: string[];
    errors: Array<{ stepId: string; error: string }>;
  }> {
    execution.status = 'COMPENSATING';
    this.journal.append({
      executionId: execution.id,
      workflowId: execution.workflowId,
      type: 'COMPENSATION_TRIGGERED',
      payload: {
        triggeringError: triggeringError.message,
        completedSteps: Object.keys(execution.steps).filter(
          id => execution.steps[id].status === 'COMPLETED'
        ),
      },
    });

    const completedStepIds = Object.keys(execution.steps).filter(
      id => execution.steps[id].status === 'COMPLETED'
    );

    const stepsToCompensate = DAGResolver.getCompensationOrder(steps, completedStepIds);
    const compensatedSteps: string[] = [];
    const failedCompensationSteps: string[] = [];
    const errors: Array<{ stepId: string; error: string }> = [];

    for (const step of stepsToCompensate) {
      if (!step.compensation) continue;

      const stepRecord = execution.steps[step.id];
      stepRecord.status = 'COMPENSATING';

      this.journal.append({
        executionId: execution.id,
        workflowId: execution.workflowId,
        stepId: step.id,
        type: 'STEP_COMPENSATING',
        payload: { stepName: step.name },
      });

      this.emit('step_compensating', {
        executionId: execution.id,
        stepId: step.id,
        stepName: step.name,
      });

      const compCtx: StepCompensationContext = {
        executionId: execution.id,
        stepId: step.id,
        workflowId: execution.workflowId,
        stepOutput: execution.stepOutputs[step.id],
        state: execution.currentState,
        error: triggeringError,
        log: (message, level = 'info') => {
          stepRecord.logs.push({
            timestamp: Date.now(),
            level,
            message: `[COMPENSATION] ${message}`,
          });
        },
      };

      try {
        await step.compensation(compCtx);
        stepRecord.status = 'COMPENSATED';
        stepRecord.compensated = true;
        compensatedSteps.push(step.id);

        this.journal.append({
          executionId: execution.id,
          workflowId: execution.workflowId,
          stepId: step.id,
          type: 'STEP_COMPENSATED',
          payload: { stepName: step.name },
        });

        this.emit('step_compensated', {
          executionId: execution.id,
          stepId: step.id,
          stepName: step.name,
        });
      } catch (compErr: any) {
        stepRecord.status = 'COMPENSATION_FAILED';
        stepRecord.compensationError = compErr.message || String(compErr);
        failedCompensationSteps.push(step.id);
        errors.push({ stepId: step.id, error: compErr.message || String(compErr) });

        this.journal.append({
          executionId: execution.id,
          workflowId: execution.workflowId,
          stepId: step.id,
          type: 'STEP_COMPENSATION_FAILED',
          payload: { stepName: step.name, error: compErr.message },
          error: { message: compErr.message, stack: compErr.stack },
        });

        this.emit('step_compensation_failed', {
          executionId: execution.id,
          stepId: step.id,
          error: compErr.message,
        });
      }
    }

    const allSucceeded = failedCompensationSteps.length === 0;
    execution.status = allSucceeded ? 'COMPENSATED' : 'FAILED';
    execution.endTime = Date.now();
    execution.durationMs = execution.endTime - execution.startTime;

    this.journal.append({
      executionId: execution.id,
      workflowId: execution.workflowId,
      type: allSucceeded ? 'WORKFLOW_COMPENSATED' : 'WORKFLOW_FAILED',
      payload: {
        compensatedSteps,
        failedCompensationSteps,
        durationMs: execution.durationMs,
      },
    });

    return {
      success: allSucceeded,
      compensatedSteps,
      failedCompensationSteps,
      errors,
    };
  }
}
