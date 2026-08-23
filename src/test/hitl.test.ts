import { describe, it, expect } from './test-framework';
import { WorkflowEngine } from '../engine/WorkflowEngine';
import { WorkflowDefinition } from '../types';

export function registerHITLTests() {
  describe('Human-in-the-Loop (HITL) Approvals', () => {
    it('should pause on approval gate and resume upon decision submission', async () => {
      const engine = new WorkflowEngine();

      const approvalWorkflow: WorkflowDefinition = {
        id: 'wf_test_approval',
        name: 'Test Approval Workflow',
        description: 'Test HITL',
        version: '1.0.0',
        steps: [
          {
            id: 'step_prepare',
            name: 'Prepare Payload',
            type: 'TASK',
            dependencies: [],
            execute: async () => ({ prepared: true }),
          },
          {
            id: 'step_approval',
            name: 'Approval Gate',
            type: 'APPROVAL_GATE',
            dependencies: ['step_prepare'],
            approvalGate: {
              gateId: 'gate_test_1',
              title: 'Confirm Deploy',
              description: 'Please approve deployment',
              requiredRole: 'OPERATOR',
            },
            execute: async () => ({ approved: true }),
          },
          {
            id: 'step_finalize',
            name: 'Finalize Execution',
            type: 'TASK',
            dependencies: ['step_approval'],
            execute: async ctx => {
              return { success: true, injectedData: ctx.state.injectedParam };
            },
          },
        ],
      };

      engine.registerWorkflow(approvalWorkflow);
      const execution = await engine.execute('wf_test_approval', { initial: 1 });

      // Wait until paused
      while (execution.status === 'RUNNING' && !execution.pendingApproval) {
        await new Promise(r => setTimeout(r, 20));
      }

      expect(execution.status).toBe('PAUSED_APPROVAL');
      expect(execution.pendingApproval?.gateId).toBe('gate_test_1');

      const pending = engine.approvalManager.getPendingApprovals();
      expect(pending.length).toBe(1);
      expect(pending[0].stepId).toBe('step_approval');

      // Submit Approval with injected data
      const submitted = engine.submitApproval({
        executionId: execution.id,
        stepId: 'step_approval',
        gateId: 'gate_test_1',
        decision: 'APPROVE',
        approver: 'Senior_SRE_Lead',
        role: 'OPERATOR',
        inputData: { injectedParam: 'CUSTOM_VALUE_99' },
      });

      expect(submitted).toBe(true);

      // Wait for execution to finish
      while (execution.status === 'RUNNING' || execution.status === 'PAUSED_APPROVAL') {
        await new Promise(r => setTimeout(r, 20));
      }

      expect(execution.status).toBe('COMPLETED');
      expect(execution.currentState.injectedParam).toBe('CUSTOM_VALUE_99');
      expect(execution.stepOutputs['step_finalize'].injectedData).toBe('CUSTOM_VALUE_99');
    });

    it('should reject and fail workflow if approval is rejected', async () => {
      const engine = new WorkflowEngine();

      const wf: WorkflowDefinition = {
        id: 'wf_test_rejection',
        name: 'Test Rejection',
        description: 'Test Rejection',
        version: '1.0.0',
        steps: [
          {
            id: 'step_gate',
            name: 'Gate',
            type: 'APPROVAL_GATE',
            dependencies: [],
            approvalGate: {
              gateId: 'gate_reject_test',
              title: 'Critical Action',
              description: 'Dangerous operation',
              requiredRole: 'ADMIN',
            },
            execute: async () => {},
          },
        ],
      };

      engine.registerWorkflow(wf);
      const exec = await engine.execute('wf_test_rejection');

      while (!exec.pendingApproval) {
        await new Promise(r => setTimeout(r, 20));
      }

      engine.submitApproval({
        executionId: exec.id,
        stepId: 'step_gate',
        gateId: 'gate_reject_test',
        decision: 'REJECT',
        approver: 'SecurityLead',
        role: 'ADMIN',
        comment: 'Security policy compliance failure',
      });

      while (exec.status === 'RUNNING' || exec.status === 'PAUSED_APPROVAL') {
        await new Promise(r => setTimeout(r, 20));
      }

      expect(exec.status).toBe('COMPENSATED'); // saga rollback or failed
      expect(exec.steps['step_gate'].status).toBe('FAILED');
      expect(exec.steps['step_gate'].error).toContain('Security policy compliance failure');
    });
  });
}
