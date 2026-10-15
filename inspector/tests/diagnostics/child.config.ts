import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  envDir: false,
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  test: {
    include: [process.env.TENET_DIAGNOSTIC_TARGET === 'debugger' ? 'inspector/tests/diagnostics/debugger.case.ts' : 'inspector/tests/diagnostics/fixture.case.ts'],
    ...(process.env.TENET_DIAGNOSTIC_TARGET === 'debugger' ? { testNamePattern: process.env.TENET_DIAGNOSTIC_CASE === 'success' ? 'initial archive selection|default story and keyboard disclosures at 1280px' : 'initial archive selection' } : {}),
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
