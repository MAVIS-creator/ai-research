import { describe, it, expect } from './test-framework';
import { DAGResolver } from '../engine/DAGResolver';
import { WorkflowStep } from '../types';

export function registerDAGTests() {
  describe('DAGResolver & Dependency Analysis', () => {
    it('should correctly order linear dependencies topologically', () => {
      const steps: WorkflowStep[] = [
        { id: 'step_3', name: 'Step 3', type: 'TASK', dependencies: ['step_2'], execute: async () => {} },
        { id: 'step_1', name: 'Step 1', type: 'TASK', dependencies: [], execute: async () => {} },
        { id: 'step_2', name: 'Step 2', type: 'TASK', dependencies: ['step_1'], execute: async () => {} },
      ];

      const validation = DAGResolver.validate(steps);
      expect(validation.isValid).toBe(true);
      expect(validation.topologicalOrder).toEqual(['step_1', 'step_2', 'step_3']);
    });

    it('should detect cycles and report error', () => {
      const cyclicSteps: WorkflowStep[] = [
        { id: 'node_a', name: 'Node A', type: 'TASK', dependencies: ['node_b'], execute: async () => {} },
        { id: 'node_b', name: 'Node B', type: 'TASK', dependencies: ['node_a'], execute: async () => {} },
      ];

      const validation = DAGResolver.validate(cyclicSteps);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('Cycle detected');
    });

    it('should detect self-cycles', () => {
      const selfCycleSteps: WorkflowStep[] = [
        { id: 'node_x', name: 'Node X', type: 'TASK', dependencies: ['node_x'], execute: async () => {} },
      ];

      const validation = DAGResolver.validate(selfCycleSteps);
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain('cannot depend on itself');
    });

    it('should detect missing dependencies', () => {
      const missingDepSteps: WorkflowStep[] = [
        { id: 'step_b', name: 'Step B', type: 'TASK', dependencies: ['non_existent_step'], execute: async () => {} },
      ];

      const validation = DAGResolver.validate(missingDepSteps);
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain('unknown dependency');
    });

    it('should calculate ready steps for parallel diamond fan-out', () => {
      const steps: WorkflowStep[] = [
        { id: 'start', name: 'Start', type: 'TASK', dependencies: [], execute: async () => {} },
        { id: 'branch_a', name: 'Branch A', type: 'TASK', dependencies: ['start'], execute: async () => {} },
        { id: 'branch_b', name: 'Branch B', type: 'TASK', dependencies: ['start'], execute: async () => {} },
        { id: 'join', name: 'Join', type: 'TASK', dependencies: ['branch_a', 'branch_b'], execute: async () => {} },
      ];

      // Initially only 'start' is ready
      const ready1 = DAGResolver.getReadySteps(steps, new Set(), new Set(), new Set(), new Set());
      expect(ready1.map(s => s.id)).toEqual(['start']);

      // After 'start' completes, both branch_a and branch_b are ready concurrently
      const ready2 = DAGResolver.getReadySteps(steps, new Set(['start']), new Set(), new Set(), new Set());
      expect(ready2.map(s => s.id)).toEqual(['branch_a', 'branch_b']);

      // When only branch_a is done, join is NOT ready
      const ready3 = DAGResolver.getReadySteps(steps, new Set(['start', 'branch_a']), new Set(['branch_b']), new Set(), new Set());
      expect(ready3.length).toBe(0);

      // When both branches complete, join is ready
      const ready4 = DAGResolver.getReadySteps(steps, new Set(['start', 'branch_a', 'branch_b']), new Set(), new Set(), new Set());
      expect(ready4.map(s => s.id)).toEqual(['join']);
    });
  });
}
