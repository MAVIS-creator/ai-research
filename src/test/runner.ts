import { runAllTests } from './test-framework';
import { registerDAGTests } from './dag.test';
import { registerSagaTests } from './saga.test';
import { registerHITLTests } from './hitl.test';
import { registerAgentTests } from './agent.test';
import { registerJournalTests } from './journal.test';
import { registerConcurrencyTests } from './concurrency.test';

async function main() {
  // Register all suites
  registerDAGTests();
  registerSagaTests();
  registerHITLTests();
  registerAgentTests();
  registerJournalTests();
  registerConcurrencyTests();

  const results = await runAllTests();
  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
