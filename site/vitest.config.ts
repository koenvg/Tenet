import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: { include: ['site/tests/**/*.vitest.ts'], environment: 'node', fileParallelism: false, maxWorkers: 1, testTimeout: 20_000, hookTimeout: 30_000 },
});
