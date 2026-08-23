import { describe, it, expect } from './test-framework';
import { WorkflowEngine } from '../engine/WorkflowEngine';
import { WorkflowDefinition } from '../types';

export function registerSagaTests() {
  describe('Saga Pattern & Compensation Rollbacks', () => {
    it('should automatically trigger backward compensation on step failure', async () => {
      const engine = new WorkflowEngine();
      const rollbackLog: string[] = [];

      const sagaWorkflow: WorkflowDefinition = {
        id: 'wf_test_saga',
        name: 'Test Saga Rollback Workflow',
        description: 'Test Saga',
        version: '1.0.0',
        steps: [
          {
            id: 'step_1_reserve',
            name: 'Reserve Item',
            type: 'TASK',
            dependencies: [],
            execute: async ctx => {
              return { reservationId: 'RES-101' };
            },
            compensation: async ctx => {
              rollbackLog.push(`Compensated: ${ctx.stepId} with res=${ctx.stepOutput.reservationId}`);
            },
          },
          {
            id: 'step_2_charge',
            name: 'Charge Payment',
            type: 'TASK',
            dependencies: ['step_1_reserve'],
            execute: async ctx => {
              return { chargeId: 'CHG-202' };
            },
            compensation: async ctx => {
              rollbackLog.push(`Compensated: ${ctx.stepId} with chg=${ctx.stepOutput.chargeId}`);
            },
          },
          {
            id: 'step_3_fail',
            name: 'Faulty Downstream Service',
            type: 'TASK',
            dependencies: ['step_2_charge'],
            retryPolicy: { maxAttempts: 1, initialIntervalMs: 10, maxIntervalMs: 20, backoffMultiplier: 1, jitter: false },
            execute: async ctx => {
              throw new Error('Simulated network partition on warehouse terminal');
            },
          },
        ],
      };

      engine.registerWorkflow(sagaWorkflow);
      const execution = await engine.execute('wf_test_saga');

      // Wait for execution and rollback to complete
      while (execution.status === 'RUNNING' || execution.status === 'COMPENSATING') {
        await new Promise(r => setTimeout(r, 20));
      }

      expect(execution.status).toBe('COMPENSATED');
      expect(execution.steps['step_1_reserve'].compensated).toBe(true);
      expect(execution.steps['step_2_charge'].compensated).toBe(true);

      // Verify reverse LIFO rollback order: step 2 was compensated before step 1
      expect(rollbackLog.length).toBe(2);
      expect(rollbackLog[0]).toContain('step_2_charge');
      expect(rollbackLog[1]).toContain('step_1_reserve');

      // Check DLQ entry
      const dlq = engine.getDLQ();
      expect(dlq.length).toBe(1);
      expect(dlq[0].executionId).toBe(execution.id);
      expect(dlq[0].error).toContain('Simulated network partition');
    });
  });
}
