import { describe, it, expect } from './test-framework';
import { WorkflowEngine } from '../engine/WorkflowEngine';
import { WorkflowDefinition } from '../types';

export function registerConcurrencyTests() {
  describe('High-Concurrency Engine Execution & Race Conditions', () => {
    it('should reliably execute 30 concurrent workflows without race conditions', async () => {
      const engine = new WorkflowEngine();

      const benchWorkflow: WorkflowDefinition = {
        id: 'wf_concurrent_bench',
        name: 'Concurrent Stress Workflow',
        description: 'Test concurrency',
        version: '1.0.0',
        steps: [
          {
            id: 'step_init',
            name: 'Init State',
            type: 'TASK',
            dependencies: [],
            execute: async ctx => ({ val: ctx.state.index }),
          },
          {
            id: 'step_parallel_1',
            name: 'Parallel Branch 1',
            type: 'TASK',
            dependencies: ['step_init'],
            execute: async ctx => {
              await new Promise(r => setTimeout(r, 10));
              return { branch: 1, val: ctx.state.index * 2 };
            },
          },
          {
            id: 'step_parallel_2',
            name: 'Parallel Branch 2',
            type: 'TASK',
            dependencies: ['step_init'],
            execute: async ctx => {
              await new Promise(r => setTimeout(r, 10));
              return { branch: 2, val: ctx.state.index * 3 };
            },
          },
          {
            id: 'step_merge',
            name: 'Merge Parallel Branches',
            type: 'TASK',
            dependencies: ['step_parallel_1', 'step_parallel_2'],
            execute: async ctx => {
              const b1 = ctx.stepOutputs['step_parallel_1'].val;
              const b2 = ctx.stepOutputs['step_parallel_2'].val;
              return { total: b1 + b2 };
            },
          },
        ],
      };

      engine.registerWorkflow(benchWorkflow);

      const count = 30;
      const promises = Array.from({ length: count }).map(async (_, idx) => {
        const exec = await engine.execute('wf_concurrent_bench', { index: idx + 1 });
        while (exec.status === 'RUNNING') {
          await new Promise(r => setTimeout(r, 15));
        }
        return exec;
      });

      const executions = await Promise.all(promises);

      expect(executions.length).toBe(count);
      for (let i = 0; i < count; i++) {
        const exec = executions[i];
        expect(exec.status).toBe('COMPLETED');
        const expectedTotal = (i + 1) * 2 + (i + 1) * 3;
        expect(exec.stepOutputs['step_merge'].total).toBe(expectedTotal);
      }

      const metrics = engine.getMetrics();
      expect(metrics.completedExecutions).toBe(count);
      expect(metrics.latenciesMs.p50).toBeGreaterThan(0);
      expect(metrics.dlqDepth).toBe(0);
    });
  });
}
