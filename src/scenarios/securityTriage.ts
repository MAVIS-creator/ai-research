import { WorkflowDefinition } from '../types';
import { AgentRunner } from '../agents/AgentRunner';
import { ToolRegistry } from '../agents/ToolRegistry';

export function createSecurityTriageWorkflow(toolRegistry: ToolRegistry): WorkflowDefinition {
  const agentRunner = new AgentRunner(toolRegistry);

  return {
    id: 'wf_security_triage',
    name: 'Autonomous Secret Leak & CVE Quarantine Pipeline',
    description: 'Scans repositories and telemetry logs for leaked API keys, invokes an autonomous security intelligence agent to assess blast radius, requests SecOps sign-off, and revokes credentials.',
    version: '1.1.0',
    tags: ['Security', 'SecOps', 'Zero-Trust', 'Quarantine', 'HITL'],
    steps: [
      {
        id: 'step_scan_commit_log',
        name: 'Repository Commit & Secret Leak Scan',
        type: 'TASK',
        dependencies: [],
        execute: async ctx => {
          ctx.log('Scanning git commits and configuration repositories for entropy anomalies...', 'info');
          ctx.reportProgress(40, 'Scanning git history');
          await new Promise(r => setTimeout(r, 200));

          const leakDetection = {
            commitId: 'b7e21a88',
            repository: 'enterprise/microservices-backend',
            author: 'engineer@corp.internal',
            detectedPattern: 'AKIAIOSFODNN7EXAMPLE',
            file: 'config/prod-credentials.json',
            timestamp: new Date().toISOString(),
          };

          ctx.log(`Potential secret leak detected in commit ${leakDetection.commitId}: ${leakDetection.file}`, 'warn');
          ctx.reportProgress(100, 'Scan completed');
          return leakDetection;
        },
      },
      {
        id: 'step_security_agent_triage',
        name: 'Autonomous SecOps Agent Threat Analysis',
        type: 'AGENT',
        dependencies: ['step_scan_commit_log'],
        agentConfig: {
          agentId: 'agent_secops_triager',
          role: 'Senior Cyber Incident Responder',
          goal: 'Analyze blast radius of compromised AWS API credential and verify if privileges allow production access',
          tools: ['text_analyzer', 'code_sandbox'],
          guardrails: { maskPii: true, maxTokens: 1500 },
        },
        execute: async ctx => {
          const scan = ctx.stepOutputs['step_scan_commit_log'];
          ctx.log('Deploying SecOps Agent to analyze token exposure and blast radius...', 'info');

          const agentResult = await agentRunner.runAgentTask(
            {
              agentId: 'agent_secops_triager',
              role: 'Senior Cyber Incident Responder',
              goal: `Assess risk and blast radius of leaked credential ${scan.detectedPattern} in ${scan.repository}`,
              tools: ['text_analyzer', 'code_sandbox'],
              guardrails: { maskPii: true, maxTokens: 1500 },
            },
            ctx
          );

          return {
            riskLevel: 'CRITICAL',
            blastRadius: 'S3 Buckets (Production Customer Data) + KMS Master Decrypt Permissions',
            recommendedAction: 'Immediate revocation of IAM Access Key and rotation of dependent microservice environment secrets',
            agentTrace: agentResult.reasoningTrace,
            tokenUsage: agentResult.tokenUsage,
          };
        },
      },
      {
        id: 'step_secops_approval',
        name: 'Security Lead Emergency Revocation Authorization',
        type: 'APPROVAL_GATE',
        dependencies: ['step_security_agent_triage'],
        approvalGate: {
          gateId: 'gate_secops_emergency_revocation',
          title: 'Authorize Emergency IAM Credential Revocation',
          description: 'SecOps Agent detected critical AWS Key exposure with production S3 access. Confirm automated key disabling and vault secret rotation.',
          requiredRole: 'ADMIN',
          timeoutMs: 45000,
          fallbackAction: 'AUTO_APPROVE',
          inputSchema: {
            notifySlackChannel: { type: 'string', label: 'Security Alert Channel', default: '#security-incidents' },
            generateAuditTicket: { type: 'boolean', label: 'Auto-create Jira Security Ticket', default: true },
          },
        },
        execute: async ctx => {
          ctx.log('SecOps authorization granted. Executing automated remediation sequence.', 'info');
          return { approved: true, authorizedAt: Date.now() };
        },
      },
      {
        id: 'step_revoke_and_rotate',
        name: 'Automated IAM Revocation & Vault Rotation',
        type: 'TASK',
        dependencies: ['step_secops_approval'],
        execute: async ctx => {
          ctx.log('Calling AWS IAM API to inactivate and delete compromised Access Key...', 'info');
          ctx.reportProgress(50, 'Revoking key & generating new Vault secret');
          await new Promise(r => setTimeout(r, 250));

          const rotationResult = {
            revokedKeyId: 'AKIAIOSFODNN7EXAMPLE',
            newKeyGenerated: true,
            vaultSecretVersion: 4,
            microservicesRestarted: ['billing-service', 'analytics-worker'],
            status: 'COMPLETED_SECURE',
          };

          ctx.log('Compromised credential invalidated. New Vault version 4 deployed.', 'info');
          ctx.reportProgress(100, 'Remediation successful');
          return rotationResult;
        },
      },
    ],
  };
}
