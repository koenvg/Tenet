import { test as base, expect } from 'playwright/test';
import { closeBrowser, launchBrowser, withInspector, type InspectorFactories } from './integration/fixture.js';

type WithInspector = (...args: Parameters<typeof withInspector> extends [unknown, unknown, ...infer Rest] ? Rest : never) => Promise<void>;

export function createInspectorTest(factories: InspectorFactories = {}, launch = true, afterClose?: () => Promise<void>) {
  return base.extend<{ withInspector: WithInspector }, { inspectorWorker: void }>({
    inspectorWorker: [async ({}, use) => {
      try {
        if (launch) await launchBrowser(factories);
        await use();
      } finally {
        try { await closeBrowser(); } finally { await afterClose?.(); }
      }
    }, { scope: 'worker', auto: true, timeout: 30_000 }],
    withInspector: [async ({ inspectorWorker: _owner }, use, testInfo) => {
      const controller = new AbortController();
      const finishes: Array<(error?: unknown) => Promise<unknown>> = [];
      let useError: unknown;
      try {
        await use((...args) => withInspector({ signal: controller.signal, onFinish: finish => finishes.push(finish) }, factories, ...args));
      } catch (error) { useError = error; }
      const primary = testInfo.errors[0] ?? useError;
      if (testInfo.status === 'timedOut' || testInfo.status === 'interrupted') {
        controller.abort(primary ?? new Error(`Test ${testInfo.status}`));
      }
      let cleanup: unknown;
      for (const finish of finishes) { const error = await finish(primary); cleanup ??= error; }
      if (useError !== undefined) throw useError;
      if (!primary && cleanup !== undefined) throw cleanup;
    }, { timeout: 30_000 }],
  });
}

export const test = createInspectorTest();
export { expect };
