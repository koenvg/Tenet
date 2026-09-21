import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    // Node orchestrates Playwright against the owner's already-running Arc.
    // A separate suffix keeps Bun's node:test suite from collecting Vitest files.
    include: ['inspector/tests/**/*.vitest.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
