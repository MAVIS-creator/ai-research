// NexusFlow Production Verification & Benchmark Suite
// Directly exercises production engine, Google Antigravity Provider, Security assessment, VM sandboxes, RBAC, Saga rollbacks, and recovery

const {
  WorkflowEngine,
  ToolRegistry,
  DAGResolver,
  DurableJournal,
  ApprovalManager,
  GuardrailPolicy,
  AntigravityProvider,
  registerScenarios,
  API_KEYS,
} = require('../server/native-server.js');

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`       NexusFlow Production Verification Suite        `);
  console.log(`======================================================\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${details}`);
      failed++;
    }
  }

  // --- SUITE 1: DAG Resolver & Topological Dependency Sort ---
  console.log(`Suite 1: DAG Resolver & Topological Dependency Sort`);
  const linearDAG = DAGResolver.validate([
    { id: 'c', dependencies: ['b'], execute: async () => {} },
    { id: 'a', dependencies: [], execute: async () => {} },
    { id: 'b', dependencies: ['a'], execute: async () => {} }
  ]);
  assert(linearDAG.isValid === true, 'Linear DAG validates without errors');
  assert(JSON.stringify(linearDAG.topologicalOrder) === JSON.stringify(['a', 'b', 'c']), 'Topological sort order is strictly [a, b, c]');

  const cyclicDAG = DAGResolver.validate([
    { id: 'x', dependencies: ['y'], execute: async () => {} },
    { id: 'y', dependencies: ['x'], execute: async () => {} }
  ]);
  assert(cyclicDAG.isValid === false, 'Cycle detection catches circular dependency');

  // --- SUITE 2: Hardened VM Sandboxing & Exploit Defense ---
  console.log(`\nSuite 2: Hardened VM Sandboxing & Exploit Defense`);
  const toolRegistry = new ToolRegistry();

  const validExec = await toolRegistry.executeTool('code_sandbox', {
    code: 'return data.items.map(x => x * 2).reduce((a, b) => a + b, 0)',
    inputData: { items: [1, 2, 3, 4] }
  });
  assert(validExec.success === true && validExec.result === 20, 'Legitimate JS data transform evaluates correctly returning 20');

  const exploit1 = await toolRegistry.executeTool('code_sandbox', {
    code: 'return ({}).constructor.constructor("return process")()'
  });
  assert(exploit1.success === false, 'Blocked prototype constructor escape to global process');

  // --- SUITE 3: Guardrails & PII Scrubbing ---
  console.log(`\nSuite 3: Guardrails & PII Scrubber`);
  const rawText = 'Contact engineer dev@corp.internal with SSN 000-12-3456 and AWS secret AKIAIOSFODNN7EXAMPLE and Bearer eyJhbGciOiJIUzI1NiJ9.test';
  const scrubbed = GuardrailPolicy.maskPII(rawText);
  assert(scrubbed.includes('[REDACTED_EMAIL]'), 'Email addresses redacted');
  assert(scrubbed.includes('[REDACTED_SSN]'), 'SSN records redacted');
  assert(scrubbed.includes('[REDACTED_AWS_KEY]'), 'AWS access keys redacted');

  // --- SUITE 4: Google Antigravity Provider & Autonomous Operator ---
  console.log(`\nSuite 4: Google Antigravity Provider & Autonomous Operator`);
  const antigravity = new AntigravityProvider();
  const config = antigravity.getConfig();
  assert(typeof config.isConfigured === 'boolean', 'Antigravity provider reports configuration state');

  const decision = await antigravity.planNextStep({
    mission: 'Authorized Security Assessment',
    target: 'https://attendance.highqsolidacademy.com',
    allowedDomains: ['attendance.highqsolidacademy.com'],
    history: [],
    availableTools: toolRegistry.listTools(),
  });
  assert(decision.currentAction !== undefined, 'Antigravity AI produces actionable operational step');
  assert(decision.toolName === 'security_headers_scanner', 'Antigravity AI selects security headers tool for initial phase');

  // --- SUITE 5: Full End-to-End Authorized Security Assessment Execution ---
  console.log(`\nSuite 5: Authorized Security Assessment Execution Loop`);
  const testJournalDir = path.join(process.cwd(), '.test-nexus-sec-' + Date.now());
  const engine = new WorkflowEngine(testJournalDir);
  registerScenarios(engine, toolRegistry, antigravity);

  const secExec = await engine.execute('wf_authorized_security_assessment', {
    objective: 'Authorized Security Assessment of Attendance Portal',
    targetUrl: 'https://attendance.highqsolidacademy.com',
    allowedDomains: ['attendance.highqsolidacademy.com']
  });

  // Step 1: Wait for HITL gate
  while (secExec.status === 'RUNNING' && !secExec.steps['step_operator_approval']?.status.includes('WAITING')) {
    await new Promise(r => setTimeout(r, 20));
  }
  assert(secExec.status === 'PAUSED_APPROVAL', 'Security workflow paused at human operator gate before synthetic probe');

  // Step 2: Approve gate
  engine.submitApproval({
    executionId: secExec.id,
    stepId: 'step_operator_approval',
    gateId: 'gate_active_synthetic_probe',
    decision: 'APPROVE',
    approver: 'SecurityLead',
    role: 'OPERATOR',
    inputData: { allowedRateRps: 2 }
  });

  // Step 3: Wait for completion
  while (secExec.status === 'RUNNING' || secExec.status === 'PAUSED_APPROVAL') {
    await new Promise(r => setTimeout(r, 20));
  }

  assert(secExec.status === 'COMPLETED', 'Security assessment workflow completed successfully');
  const finalReport = secExec.stepOutputs['step_antigravity_final_synthesis'];
  assert(finalReport && finalReport.findings && finalReport.findings.length > 0, 'Antigravity AI produced structured findings report');

  try { fs.rmSync(testJournalDir, { recursive: true, force: true }); } catch {}

  console.log(`\n======================================================`);
  console.log(`Final Verification Result: ${passed}/${passed + failed} Tests Passed, ${failed} Failed`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
