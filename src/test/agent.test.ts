import { describe, it, expect } from './test-framework';
import { ToolRegistry } from '../agents/ToolRegistry';
import { GuardrailPolicy } from '../agents/GuardrailPolicy';
import { AgentRunner } from '../agents/AgentRunner';
import { StepExecutionContext } from '../types';

export function registerAgentTests() {
  describe('Multi-Agent Sandbox, Tool Registry & Guardrails', () => {
    it('should mask PII patterns and secrets correctly', () => {
      const dirtyText = 'Contact alice@corp.com with SSN 123-45-6789 and AWS key AKIAIOSFODNN7EXAMPLE';
      const masked = GuardrailPolicy.maskPII(dirtyText);

      expect(masked).toContain('[REDACTED_EMAIL]');
      expect(masked).toContain('[REDACTED_SSN]');
      expect(masked).toContain('[REDACTED_AWS_KEY]');
      expect(masked.includes('alice@corp.com')).toBe(false);
      expect(masked.includes('123-45-6789')).toBe(false);
    });

    it('should execute sandboxed JS code safely in CodeRunner tool', async () => {
      const registry = new ToolRegistry();
      const result = await registry.executeTool('code_sandbox', {
        code: 'const nums = data.values; return nums.reduce((a, b) => a + b, 0);',
        inputData: { values: [10, 20, 30, 40] },
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(100);
    });

    it('should block unsafe operations via Guardrail validation', () => {
      const unsafeCheck = GuardrailPolicy.validateSafety('code_sandbox', {
        code: 'process.exit(1);',
      });
      expect(unsafeCheck.isSafe).toBe(false);
      expect(unsafeCheck.reason).toContain('Disallowed system command');
    });

    it('should run multi-iteration AgentRunner loop and produce structured reasoning trace', async () => {
      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry);

      const logs: string[] = [];
      const mockContext: StepExecutionContext = {
        executionId: 'exec_agent_test',
        stepId: 'step_test_agent',
        workflowId: 'wf_test',
        attempt: 1,
        state: { service: 'payment-gateway', alert: '5xx spike' },
        stepOutputs: {},
        log: msg => logs.push(msg),
        reportProgress: () => {},
        signal: new AbortController().signal,
      };

      const result = await runner.runAgentTask(
        {
          agentId: 'agent_test_sre',
          role: 'Incident Diagnostician',
          goal: 'Investigate payment-gateway error rate spike',
          tools: ['sql_query', 'text_analyzer', 'code_sandbox'],
          guardrails: { maskPii: true, maxTokens: 1000 },
        },
        mockContext
      );

      expect(result.status).toBe('SUCCESS');
      expect(result.reasoningTrace.length).toBeGreaterThan(0);
      expect(result.tokenUsage.totalTokens).toBeGreaterThan(0);
      expect(result.output).toBeTruthy();
    });
  });
}
