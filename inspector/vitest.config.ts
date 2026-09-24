import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    // Node owns the temporary archive and drives a disposable headless Chromium.
    // The suffix keeps Bun's test runner from collecting Vitest files.
    include: ['inspector/tests/debugger.vitest.ts', 'inspector/tests/integration/**/*.vitest.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
