export interface TestCase {
  name: string;
  fn: () => Promise<void> | void;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
}

const suites: TestSuite[] = [];
let currentSuite: TestSuite | null = null;

export function describe(name: string, fn: () => void) {
  const suite: TestSuite = { name, tests: [] };
  currentSuite = suite;
  suites.push(suite);
  fn();
  currentSuite = null;
}

export function it(name: string, fn: () => Promise<void> | void) {
  if (!currentSuite) {
    throw new Error(`Test "${name}" must be inside a describe block.`);
  }
  currentSuite.tests.push({ name, fn });
}

export function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected: any) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected:\n${b}\nReceived:\n${a}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (!(actual >= expected)) {
        throw new Error(`Expected ${actual} to be >= ${expected}`);
      }
    },
    toContain(expected: any) {
      if (Array.isArray(actual) || typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
        }
      } else {
        throw new Error(`actual is not an array or string`);
      }
    },
    toThrow(expectedMessage?: string) {
      let threw = false;
      let errorMsg = '';
      try {
        if (typeof actual === 'function') {
          actual();
        }
      } catch (err: any) {
        threw = true;
        errorMsg = err.message || '';
      }
      if (!threw) {
        throw new Error(`Expected function to throw an error, but it did not.`);
      }
      if (expectedMessage && !errorMsg.includes(expectedMessage)) {
        throw new Error(`Expected error containing "${expectedMessage}", got "${errorMsg}"`);
      }
    },
  };
}

export async function runAllTests(): Promise<{ total: number; passed: number; failed: number; errors: Array<{ suite: string; test: string; error: string }> }> {
  let total = 0;
  let passed = 0;
  let failed = 0;
  const errors: Array<{ suite: string; test: string; error: string }> = [];

  console.log(`\n======================================================`);
  console.log(`           NexusFlow Automated Test Suite             `);
  console.log(`======================================================\n`);

  for (const suite of suites) {
    console.log(`\nSuite: ${suite.name}`);
    for (const test of suite.tests) {
      total++;
      const start = Date.now();
      try {
        await test.fn();
        const duration = Date.now() - start;
        console.log(`  [PASS] ${test.name} (${duration}ms)`);
        passed++;
      } catch (err: any) {
        const duration = Date.now() - start;
        console.log(`  [FAIL] ${test.name} (${duration}ms)`);
        console.log(`         Error: ${err.message}`);
        failed++;
        errors.push({ suite: suite.name, test: test.name, error: err.message });
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`Test Run Complete: ${passed}/${total} Passed, ${failed} Failed`);
  console.log(`======================================================\n`);

  return { total, passed, failed, errors };
}
