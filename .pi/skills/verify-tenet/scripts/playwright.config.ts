import assert from 'node:assert/strict';
import { join } from 'node:path';
import { defineConfig } from 'playwright/test';

const evidence = process.env.TENET_VERIFY_EVIDENCE;
assert.ok(evidence, 'launch through run.py');

export default defineConfig({
  testDir: '.',
  testMatch: 'proof.ts',
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  outputDir: join(evidence, 'runner'),
  preserveOutput: 'never',
  use: { headless: true, trace: 'off', video: 'off', screenshot: 'off' },
});
