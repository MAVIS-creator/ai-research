import { WorkflowEvent, TimeTravelSnapshot, ExecutionStatus, StepStatus } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class DurableJournal {
  private events: Map<string, WorkflowEvent[]> = new Map();
  private snapshots: Map<string, TimeTravelSnapshot[]> = new Map();
  private storageDir: string | null = null;

  constructor(storageDir?: string) {
    if (storageDir) {
      this.storageDir = storageDir;
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
    }
  }

  public appendFromRecovered(event: WorkflowEvent): void {
    const executionId = event.executionId;
    if (!this.events.has(executionId)) {
      this.events.set(executionId, []);
      this.snapshots.set(executionId, []);
    }
    this.events.get(executionId)!.push(event);
  }

  /**
   * Append an event to the execution journal and persist to disk WAL.
   */
  public append(event: Omit<WorkflowEvent, 'sequenceNumber' | 'timestamp'>): WorkflowEvent {
    const executionId = event.executionId;
    if (!this.events.has(executionId)) {
      this.events.set(executionId, []);
      this.snapshots.set(executionId, []);
    }

    const execEvents = this.events.get(executionId)!;
    const sequenceNumber = execEvents.length + 1;
    const fullEvent: WorkflowEvent = {
      ...event,
      timestamp: Date.now(),
      sequenceNumber,
    };

    execEvents.push(fullEvent);

    if (this.storageDir) {
      this.persistEvent(fullEvent);
    }

    return fullEvent;
  }

  /**
   * Save a computed snapshot at the current sequence number for instant time-travel queries.
   */
  public recordSnapshot(
    executionId: string,
    snapshot: Omit<TimeTravelSnapshot, 'sequenceNumber' | 'timestamp'>
  ): TimeTravelSnapshot {
    const execEvents = this.events.get(executionId) || [];
    const seq = execEvents.length;
    const fullSnapshot: TimeTravelSnapshot = {
      ...snapshot,
      sequenceNumber: seq,
      timestamp: Date.now(),
    };

    if (!this.snapshots.has(executionId)) {
      this.snapshots.set(executionId, []);
    }
    this.snapshots.get(executionId)!.push(fullSnapshot);
    return fullSnapshot;
  }

  public getEvents(executionId: string): WorkflowEvent[] {
    return this.events.get(executionId) || [];
  }

  public getSnapshots(executionId: string): TimeTravelSnapshot[] {
    return this.snapshots.get(executionId) || [];
  }

  /**
   * Deterministically replay execution state up to a specific sequence number.
   */
  public replayToSequence(executionId: string, targetSequence: number): TimeTravelSnapshot | null {
    const events = this.getEvents(executionId);
    if (events.length === 0) return null;

    const filteredEvents = events.filter(e => e.sequenceNumber <= targetSequence);
    if (filteredEvents.length === 0) return null;

    let executionStatus: ExecutionStatus = 'PENDING';
    let activeStepId: string | undefined = undefined;
    const state: Record<string, any> = {};
    const stepOutputs: Record<string, any> = {};
    const stepStatuses: Record<string, StepStatus> = {};
    let lastEventDesc = '';

    for (const evt of filteredEvents) {
      lastEventDesc = `${evt.type}: ${evt.stepId || 'workflow'}`;
      switch (evt.type) {
        case 'WORKFLOW_STARTED':
          executionStatus = 'RUNNING';
          Object.assign(state, evt.payload?.initialState || {});
          break;
        case 'STEP_STARTED':
          if (evt.stepId) {
            stepStatuses[evt.stepId] = 'RUNNING';
            activeStepId = evt.stepId;
          }
          break;
        case 'STEP_COMPLETED':
          if (evt.stepId) {
            stepStatuses[evt.stepId] = 'COMPLETED';
            stepOutputs[evt.stepId] = evt.payload?.output;
            if (evt.payload?.stateUpdate) {
              Object.assign(state, evt.payload.stateUpdate);
            }
          }
          break;
        case 'STEP_FAILED':
          if (evt.stepId) {
            stepStatuses[evt.stepId] = 'FAILED';
          }
          break;
        case 'STEP_RETRYING':
          if (evt.stepId) {
            stepStatuses[evt.stepId] = 'RETRYING';
          }
          break;
        case 'APPROVAL_REQUESTED':
          executionStatus = 'PAUSED_APPROVAL';
          if (evt.stepId) {
            stepStatuses[evt.stepId] = 'WAITING_APPROVAL';
          }
          break;
        case 'APPROVAL_RESOLVED':
          if (evt.payload?.decision === 'APPROVE') {
            executionStatus = 'RUNNING';
          }
          break;
        case 'COMPENSATION_TRIGGERED':
          executionStatus = 'COMPENSATING';
          break;
        case 'STEP_COMPENSATING':
          if (evt.stepId) {
            stepStatuses[evt.stepId] = 'COMPENSATING';
          }
          break;
        case 'STEP_COMPENSATED':
          if (evt.stepId) {
            stepStatuses[evt.stepId] = 'COMPENSATED';
          }
          break;
        case 'WORKFLOW_COMPLETED':
          executionStatus = 'COMPLETED';
          break;
        case 'WORKFLOW_COMPENSATED':
          executionStatus = 'COMPENSATED';
          break;
        case 'WORKFLOW_FAILED':
          executionStatus = 'FAILED';
          break;
        case 'WORKFLOW_CANCELLED':
          executionStatus = 'CANCELLED';
          break;
      }
    }

    const lastEvt = filteredEvents[filteredEvents.length - 1];
    return {
      sequenceNumber: targetSequence,
      timestamp: lastEvt.timestamp,
      eventType: lastEvt.type,
      executionStatus,
      activeStepId,
      stateSnapshot: JSON.parse(JSON.stringify(state)),
      stepOutputsSnapshot: JSON.parse(JSON.stringify(stepOutputs)),
      stepStatuses: { ...stepStatuses },
      eventDescription: lastEventDesc,
    };
  }

  private persistEvent(event: WorkflowEvent): void {
    if (!this.storageDir) return;
    try {
      const filePath = path.join(this.storageDir, `${event.executionId}.journal.jsonl`);
      fs.appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf-8');
    } catch (err) {
      console.warn('Failed to persist journal event to disk:', err);
    }
  }
}
