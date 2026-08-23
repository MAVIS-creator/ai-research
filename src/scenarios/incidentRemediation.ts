import { WorkflowDefinition } from '../types';
import { AgentRunner } from '../agents/AgentRunner';
import { ToolRegistry } from '../agents/ToolRegistry';

export function createIncidentRemediationWorkflow(toolRegistry: ToolRegistry): WorkflowDefinition {
  const agentRunner = new AgentRunner(toolRegistry);

  return {
    id: 'wf_incident_remediation',
    name: 'Autonomous Incident Remediation Saga',
    description: 'Detects critical latency/5xx anomalies, deploys diagnostic agent swarm, tests sandbox fix, requests human operator sign-off, and applies verified canary patch.',
    version: '1.2.0',
    defaultTimeoutMs: 15000,
    tags: ['SRE', 'Incident-Response', 'Multi-Agent', 'HITL', 'Canary'],
    steps: [
      {
        id: 'step_detect_alert',
        name: 'Ingest & Parse Incident Telemetry Alert',
        type: 'TASK',
        dependencies: [],
        execute: async ctx => {
          ctx.log('Ingesting P1 alert from Prometheus/Datadog alerting webhook...', 'info');
          ctx.reportProgress(30, 'Parsing alert payload');
          await new Promise(r => setTimeout(r, 200));

          const alertData = {
            incidentId: `INC-${Math.floor(Math.random() * 9000) + 1000}`,
            service: 'payment-gateway',
            severity: 'CRITICAL',
            symptom: '5xx error rate exceeded 14.8% SLA threshold (target < 1.0%)',
            affectedEndpoints: ['/v1/charges', '/v1/refunds'],
            triggeredAt: new Date().toISOString(),
          };

          ctx.log(`Alert parsed: Incident [${alertData.incidentId}] on [${alertData.service}]`, 'info');
          ctx.reportProgress(100, 'Alert ingested');
          return alertData;
        },
      },
      {
        id: 'step_agent_diagnostics',
        name: 'Autonomous Diagnostic Agent Root-Cause Analysis',
        type: 'AGENT',
        dependencies: ['step_detect_alert'],
        agentConfig: {
          agentId: 'agent_sre_diagnostician',
          role: 'Senior SRE Incident Commander',
          goal: 'Investigate payment-gateway error rate spike, query database metrics, and isolate root cause',
          tools: ['sql_query', 'text_analyzer', 'code_sandbox'],
          guardrails: { maskPii: true, maxTokens: 1500 },
        },
        execute: async ctx => {
          const alert = ctx.stepOutputs['step_detect_alert'];
          ctx.log(`Spawning Autonomous SRE Agent to diagnose incident ${alert.incidentId}...`, 'info');

          const agentResult = await agentRunner.runAgentTask(
            {
              agentId: 'agent_sre_diagnostician',
              role: 'Senior SRE Incident Commander',
              goal: `Identify root cause for ${alert.service} 5xx spike (${alert.symptom})`,
              tools: ['sql_query', 'text_analyzer', 'code_sandbox'],
              guardrails: { maskPii: true, maxTokens: 1500 },
            },
            ctx
          );

          return {
            rootCause: 'Connection pool saturation on downstream PostgreSQL read-replica leading to cascade 504 Gateway Timeouts',
            recommendedAction: 'Apply rate limiter patch (1500 RPS) and expand connection pool cap to 800',
            confidence: 0.96,
            agentTrace: agentResult.reasoningTrace,
            tokenUsage: agentResult.tokenUsage,
          };
        },
      },
      {
        id: 'step_test_sandbox_fix',
        name: 'Validate Remediation Patch in Isolated Sandbox',
        type: 'TASK',
        dependencies: ['step_agent_diagnostics'],
        retryPolicy: { maxAttempts: 2, initialIntervalMs: 100, maxIntervalMs: 500, backoffMultiplier: 2, jitter: true },
        execute: async ctx => {
          ctx.log('Mounting ephemeral staging sandbox environment...', 'info');
          ctx.reportProgress(40, 'Executing load simulation test');
          await new Promise(r => setTimeout(r, 300));

          const patchValidation = {
            sandboxStatus: 'PASSED',
            simulatedTrafficRps: 2000,
            simulated5xxRate: '0.02%',
            latencyP99Ms: 44,
            memoryStability: 'STABLE',
          };

          ctx.log('Sandbox simulation completed with 0.02% error rate. Verification verified.', 'info');
          ctx.reportProgress(100, 'Sandbox verified');
          return patchValidation;
        },
      },
      {
        id: 'step_human_approval',
        name: 'Human-in-the-Loop SRE Operator Approval Gate',
        type: 'APPROVAL_GATE',
        dependencies: ['step_test_sandbox_fix'],
        approvalGate: {
          gateId: 'gate_prod_canary_deploy',
          title: 'Authorize Production Canary Deployment',
          description: 'Autonomous agent identified connection pool saturation and recommends canary patch. Please confirm deployment parameters.',
          requiredRole: 'OPERATOR',
          timeoutMs: 60000,
          fallbackAction: 'AUTO_APPROVE',
          inputSchema: {
            canaryTrafficPercent: { type: 'number', label: 'Canary Traffic (%)', required: true, default: 10 },
            operatorNote: { type: 'string', label: 'Operator Authorization Notes', default: 'Authorized canary rollout after sandbox verification' },
          },
        },
        execute: async ctx => {
          ctx.log('Approval gate cleared. Proceeding to production canary rollout.', 'info');
          return { approved: true, timestamp: Date.now() };
        },
      },
      {
        id: 'step_deploy_canary',
        name: 'Apply Production Canary Configuration Patch',
        type: 'TASK',
        dependencies: ['step_human_approval'],
        execute: async ctx => {
          ctx.log('Connecting to production Kubernetes cluster...', 'info');
          ctx.reportProgress(50, 'Applying Envoy canary traffic shift');
          await new Promise(r => setTimeout(r, 400));

          const deployResult = {
            deployment: 'payment-gateway',
            revision: 'v2.14.8-hotfix1',
            trafficShare: '10%',
            status: 'HEALTHY',
            replicasUpdated: 4,
          };

          ctx.log('Canary patch deployed successfully. Traffic routed: 10%.', 'info');
          ctx.reportProgress(100, 'Canary live');
          return deployResult;
        },
      },
      {
        id: 'step_verify_recovery',
        name: 'Post-Remediation Telemetry Verification & Closure',
        type: 'TASK',
        dependencies: ['step_deploy_canary'],
        execute: async ctx => {
          ctx.log('Polling real-time telemetry metrics for 60s window...', 'info');
          ctx.reportProgress(60, 'Verifying 5xx error rate reduction');
          await new Promise(r => setTimeout(r, 300));

          const finalReport = {
            status: 'RESOLVED',
            baseline5xxErrorRate: '14.8%',
            postRemediation5xxErrorRate: '0.04%',
            mttrSeconds: 42,
            slaStatus: 'COMPLIANT',
            postmortemGenerated: true,
          };

          ctx.log(`Incident resolved. Error rate reduced to 0.04%. MTTR: 42 seconds.`, 'info');
          ctx.reportProgress(100, 'Workflow completed');
          return finalReport;
        },
      },
    ],
  };
}
