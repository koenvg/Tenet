import { test as base, expect } from 'playwright/test';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startInspector } from '../../src/inspector/server.js';
import { sessionKey, qualifiedSessionKey } from '../../src/recording/archive.js';
import { browserFixture } from './browser-fixture.js';
import { diagnosticUrl, FixtureDiagnostics, TraceStore } from './diagnostics/report.js';

type SuiteResources = { browser: Browser; directory: string; app: Awaited<ReturnType<typeof startInspector>>; store: TraceStore };
type DebuggerOwner = { diagnostics: FixtureDiagnostics; controller: AbortController; ready: boolean };
type DebuggerLifecycle = Pick<DebuggerRun, 'externalRequests' | 'pageErrors'> & { diagnostics: FixtureDiagnostics };
export type DebuggerRun = { page: Page; app: SuiteResources['app']; externalRequests: string[]; pageErrors: string[] };
export type DebuggerFactories = { launch?: typeof chromium.launch; start?: typeof startInspector; seed?: typeof browserFixture; temporaryDirectory?: (prefix: string) => Promise<string> };
const assertBrowserClean = (owner: Pick<DebuggerRun, 'externalRequests' | 'pageErrors'>) => {
  expect(owner.externalRequests.map(diagnosticUrl), 'non-local requests must not leave this test').toEqual([]);
  expect(owner.pageErrors, 'uncaught browser errors must not leave this test').toEqual([]);
};
export async function openDebugger(page: Page, origin: string) {
  const session = qualifiedSessionKey('pi', 's', 'main');
  await page.goto(`${origin}/?session=${session}`);
  await page.locator('.rule-trigger').first().waitFor();
  const rows = await (await page.request.get(`${origin}/api/sessions/${session}?limit=100`)).json();
  expect(rows.invocations).toHaveLength(11);
}

export function createDebuggerTest(factories: DebuggerFactories = {}, afterClose?: () => Promise<void>) {
  return base.extend<{ debuggerLifecycle: DebuggerLifecycle; debuggerRun: DebuggerRun }, { debuggerOwner: DebuggerOwner; debuggerSuite: SuiteResources }>({
    // Register teardown before dependent setup so Playwright deadlines cannot bypass resource cleanup.
    debuggerOwner: [async ({}, use) => {
      const controller = new AbortController();
      const diagnostics = new FixtureDiagnostics('debugger-suite', controller.signal);
      const owner: DebuggerOwner = { diagnostics, controller, ready: false };
      try { await use(owner); }
      finally {
        if (!owner.ready) controller.abort(new Error('Fixture "debuggerSuite" timeout of 30000ms exceeded during setup.'));
        try { await diagnostics.finish(); } finally { await afterClose?.(); }
      }
    }, { scope: 'worker', timeout: 30_000 }],
    debuggerSuite: [async ({ debuggerOwner: owner }, use) => {
      const { controller, diagnostics } = owner;
      const timer = setTimeout(() => controller.abort(new Error('Fixture "debuggerSuite" timeout of 30000ms exceeded during setup.')), 30_000);
      let primary: unknown;
      try {
        const traces = await diagnostics.acquire('browser trace directory',
          () => mkdtemp(join(tmpdir(), 'tenet-inspector-traces-')), path => rm(path, { recursive: true, force: true }));
        diagnostics.enter('setup.archive');
        const directory = await diagnostics.acquire('synthetic archive', async () => {
          const path = await (factories.temporaryDirectory ?? mkdtemp)(join(tmpdir(), 'tenet-playwright-'));
          try { return await realpath(path); }
          catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
        }, path => rm(path, { recursive: true, force: true }));
        diagnostics.enter('setup.browser');
        const browser = await diagnostics.acquire('browser',
          () => (factories.launch ?? chromium.launch.bind(chromium))({ headless: true, tracesDir: traces }), async browser => {
            try { await browser.close(); } finally { await rm(traces, { recursive: true, force: true }); }
          });
        const store = new TraceStore(traces);
        diagnostics.enter('setup.seed');
        await diagnostics.prepare((async () => {
          await (factories.seed ?? browserFixture)(directory);
          const unrelated = join(directory, sessionKey('unrelated-session'));
          await mkdir(unrelated, { mode: 0o700 });
          await writeFile(join(unrelated, 'pending.tmp'), 'in progress', { mode: 0o600 });
        })(), () => rm(directory, { recursive: true, force: true }));
        diagnostics.enter('setup.server');
        const app = await diagnostics.acquire('local server',
          () => (factories.start ?? startInspector)({ directory, assets: resolve('inspector/dist') }), app => app.close());
        diagnostics.server(app.origin);
        await diagnostics.wait(mkdir(resolve('coverage/inspector-artifacts/playwright'), { recursive: true }));
        diagnostics.check();
        clearTimeout(timer);
        owner.ready = true;
        await use({ browser, directory, app, store });
      } catch (error) { primary = error; }
      clearTimeout(timer);
      const cleanup = await diagnostics.finish(primary);
      if (primary !== undefined) throw primary;
      if (cleanup !== undefined) throw cleanup;
    }, { scope: 'worker', timeout: 30_000 }],
    debuggerLifecycle: [async ({ debuggerSuite: suite }, use, testInfo) => {
      const controller = new AbortController();
      const diagnostics = new FixtureDiagnostics(testInfo.title, controller.signal, suite.browser);
      const owner: DebuggerLifecycle = { diagnostics, externalRequests: [], pageErrors: [] };
      let primary: unknown;
      try { await use(owner); } catch (error) { primary = error; }
      primary = testInfo.errors[0] ?? primary;
      if (testInfo.status === 'timedOut' || testInfo.status === 'interrupted') controller.abort(primary ?? new Error(`Test ${testInfo.status}`));
      let error = primary;
      try { assertBrowserClean(owner); } catch (guardError) { error ??= guardError; }
      const cleanup = await diagnostics.finish(error);
      error ??= cleanup;
      if (primary !== undefined) throw primary;
      if (error !== undefined) throw error;
    }, { timeout: 30_000 }],
    debuggerRun: [async ({ debuggerSuite: suite, debuggerLifecycle: owner }, use) => {
      const { diagnostics } = owner;
      diagnostics.enter('setup.context');
      diagnostics.server(suite.app.origin);
      const context = await diagnostics.acquire('browser context',
        () => suite.browser.newContext({ viewport: { width: 2233, height: 1282 } }), async context => {
          await context.close();
          assertBrowserClean(owner);
        });
      await diagnostics.wait(diagnostics.observe(suite.browser, context, suite.app.origin, suite.store));
      context.on('page', page => page.on('pageerror', error => owner.pageErrors.push(error.message)));
      await diagnostics.wait(context.route('**/*', route => {
        const url = route.request().url();
        if (new URL(url).origin === suite.app.origin) return route.continue();
        owner.externalRequests.push(diagnosticUrl(url));
        return route.abort();
      }));
      const page = await diagnostics.wait(context.newPage());
      diagnostics.enter('navigation');
      await diagnostics.wait(openDebugger(page, suite.app.origin));
      diagnostics.enter('test');
      await use({ ...owner, page, app: suite.app });
    }, { timeout: 30_000 }],
  });
}
export const test = createDebuggerTest();
export { expect };
