import { describe, it, expect } from './test-framework';
import { DurableJournal } from '../engine/DurableJournal';

export function registerJournalTests() {
  describe('DurableJournal & Time-Travel Replay', () => {
    it('should append events with strictly monotonically increasing sequence numbers', () => {
      const journal = new DurableJournal();
      const execId = 'exec_test_journal_1';

      const e1 = journal.append({ executionId: execId, workflowId: 'wf_1', type: 'WORKFLOW_STARTED', payload: { a: 1 } });
      const e2 = journal.append({ executionId: execId, workflowId: 'wf_1', stepId: 'step_1', type: 'STEP_STARTED', payload: {} });
      const e3 = journal.append({ executionId: execId, workflowId: 'wf_1', stepId: 'step_1', type: 'STEP_COMPLETED', payload: { output: 42 } });

      expect(e1.sequenceNumber).toBe(1);
      expect(e2.sequenceNumber).toBe(2);
      expect(e3.sequenceNumber).toBe(3);

      const events = journal.getEvents(execId);
      expect(events.length).toBe(3);
    });

    it('should deterministically reconstruct historical state snapshot via time-travel replay', () => {
      const journal = new DurableJournal();
      const execId = 'exec_time_travel_test';

      journal.append({
        executionId: execId,
        workflowId: 'wf_1',
        type: 'WORKFLOW_STARTED',
        payload: { initialState: { balance: 1000 } },
      });

      journal.append({
        executionId: execId,
        workflowId: 'wf_1',
        stepId: 'step_debit',
        type: 'STEP_STARTED',
        payload: {},
      });

      journal.append({
        executionId: execId,
        workflowId: 'wf_1',
        stepId: 'step_debit',
        type: 'STEP_COMPLETED',
        payload: { output: { debited: 200 }, stateUpdate: { balance: 800 } },
      });

      journal.append({
        executionId: execId,
        workflowId: 'wf_1',
        stepId: 'step_credit',
        type: 'STEP_STARTED',
        payload: {},
      });

      journal.append({
        executionId: execId,
        workflowId: 'wf_1',
        stepId: 'step_credit',
        type: 'STEP_COMPLETED',
        payload: { output: { credited: 200 }, stateUpdate: { balance: 1000 } },
      });

      // Replay to sequence 1 (Start)
      const snapshotSeq1 = journal.replayToSequence(execId, 1);
      expect(snapshotSeq1?.executionStatus).toBe('RUNNING');
      expect(snapshotSeq1?.stateSnapshot.balance).toBe(1000);
      expect(snapshotSeq1?.stepOutputsSnapshot.step_debit).toBe(undefined);

      // Replay to sequence 3 (After debit completed)
      const snapshotSeq3 = journal.replayToSequence(execId, 3);
      expect(snapshotSeq3?.stateSnapshot.balance).toBe(800);
      expect(snapshotSeq3?.stepOutputsSnapshot.step_debit.debited).toBe(200);
      expect(snapshotSeq3?.stepStatuses.step_debit).toBe('COMPLETED');
      expect(snapshotSeq3?.stepStatuses.step_credit).toBe(undefined);

      // Replay to sequence 5 (Final)
      const snapshotSeq5 = journal.replayToSequence(execId, 5);
      expect(snapshotSeq5?.stateSnapshot.balance).toBe(1000);
      expect(snapshotSeq5?.stepOutputsSnapshot.step_credit.credited).toBe(200);
    });
  });
}
