import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['integration/**/*.pw.ts', 'debugger.pw.ts'],
  timeout: 20_000,
  expect: { timeout: 1000 },
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: 'line',
  outputDir: '../coverage/inspector-artifacts/runner',
  preserveOutput: 'never',
  use: { headless: true, trace: 'off', video: 'off', screenshot: 'off' },
});
