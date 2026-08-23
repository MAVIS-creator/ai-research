import { defineConfig } from 'vitest/config';

export default defineConfig({
  // node:sqlite is a Node built-in; keep Vite from transforming it.
  optimizeDeps: { exclude: ['node:sqlite'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Run test files sequentially — they share a process-local DB path env.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20_000,
  },
});
