import { defineConfig } from 'playwright/test';
import journeys from '../../playwright.config.js';

const debuggerTarget = process.env.TENET_DIAGNOSTIC_TARGET === 'debugger';
export default defineConfig(journeys, {
  testDir: '.',
  testMatch: debuggerTarget ? 'debugger.case.pw.ts' : 'fixture.case.pw.ts',
  ...(debuggerTarget ? { grep: process.env.TENET_DIAGNOSTIC_CASE === 'success' ? /initial archive selection|default story and keyboard disclosures at 1280px/ : /initial archive selection/ } : {}),
  outputDir: '../../../coverage/inspector-artifacts/diagnostic-runner',
});
