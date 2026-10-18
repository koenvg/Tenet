import { chromium, type BrowserContext } from 'playwright';
import { access, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startInspector } from '../../../src/inspector/server.js';
import { browserFixture } from '../browser-fixture.js';
import { createDebuggerTest, type DebuggerFactories } from '../debugger-fixture.js';
import { registerDebuggerJourneys } from '../debugger-journeys.js';
import { bounded } from './report.js';

const state = {
  mode: process.env.TENET_DIAGNOSTIC_CASE!, directory: '', origin: '', traces: '',
  launches: 0, seeds: 0, servers: 0, contexts: 0, closed: 0, disconnected: false, lateWritten: false,
  guardRequests: [] as Array<{ navigation: boolean; resourceType: string; debuggerPage: boolean }>, errorDocuments: 0,
  between: [] as Array<{ closed: number; contexts: number; directoryExists: boolean; listening: boolean }>,
};
async function probeNetworkGuard(context: BrowserContext) {
  const probe = await context.newPage();
  try { await probe.goto('https://fixture.invalid/probe?token=QUERY_SENTINEL').catch(() => {}); }
  finally { await probe.close(); }
}
const exists = (path: string) => path ? access(path).then(() => true, () => false) : Promise.resolve(false);
const listening = () => state.origin ? fetch(state.origin, { signal: AbortSignal.timeout(500) }).then(response => { void response.body?.cancel(); return true; }, () => false) : Promise.resolve(false);
const factories: DebuggerFactories = {
  temporaryDirectory: async prefix => { const directory = await mkdtemp(prefix); state.directory = directory; return directory; },
  seed: async directory => {
    state.directory = directory; state.seeds++;
    if (state.mode === 'late-seed') {
      await new Promise(resolve => setTimeout(resolve, 33_000));
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'late-synthetic.json'), '{}');
      state.lateWritten = true;
      return;
    }
    await browserFixture(directory);
    if (state.mode === 'seed') throw new Error('SEED_SENTINEL');
  },
  start: async options => {
    const app = await startInspector(options);
    state.origin = app.origin; state.servers++;
    return { ...app, close: async () => {
      await app.close();
      if (state.mode === 'teardown') throw new Error('TEARDOWN_SENTINEL');
    } };
  },
  launch: async options => {
    state.launches++; state.traces = options?.tracesDir ?? '';
    if (state.mode === 'launch') throw new Error('LAUNCH_SENTINEL');
    if (state.mode === 'late-browser') await new Promise(resolve => setTimeout(resolve, 33_000));
    const browser = await chromium.launch(options);
    browser.on('disconnected', () => { state.disconnected = true; });
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await newContext(options);
      state.contexts++;
      context.on('close', () => { state.closed++; });
      context.on('request', request => {
        if (new URL(request.url()).hostname === 'fixture.invalid') state.guardRequests.push({
          navigation: request.isNavigationRequest(), resourceType: request.resourceType(),
          debuggerPage: request.frame().page() === context.pages()[0],
        });
      });
      if (['late-pageerror', 'late-guard'].includes(state.mode)) {
        const stop = context.tracing.stop.bind(context.tracing);
        context.tracing.stop = async options => {
          const page = context.pages()[0]!;
          if (state.mode === 'late-guard') await probeNetworkGuard(context);
          else await Promise.all([
            page.waitForEvent('pageerror'),
            page.evaluate(() => { setTimeout(() => { throw new Error('PAGE_ERROR_SENTINEL'); }, 0); }),
          ]);
          await stop(options);
        };
      }
      if (['context-close', 'original'].includes(state.mode)) {
        const close = context.close.bind(context);
        context.close = async () => { await close(); throw new Error('CONTEXT_SENTINEL'); };
      }
      context.on('page', page => {
        page.on('framenavigated', frame => {
          if (page === context.pages()[0] && frame === page.mainFrame() && frame.url().startsWith('chrome-error:')) state.errorDocuments++;
        });
        if (state.mode === 'navigation') page.goto = async () => { throw new Error('NAVIGATION_SENTINEL'); };
        if (['callback', 'original', 'timeout', 'guard', 'pageerror'].includes(state.mode)) {
          const route = page.route.bind(page);
          page.route = async (url, handler, options) => {
            if (url instanceof RegExp) {
              if (state.mode === 'timeout') await new Promise(() => {});
              if (['callback', 'original', 'timeout'].includes(state.mode)) throw new Error('CALLBACK_SENTINEL');
              if (state.mode === 'guard') await probeNetworkGuard(context);
              if (state.mode === 'pageerror') await Promise.all([
                page.waitForEvent('pageerror'),
                page.evaluate(() => { setTimeout(() => { throw new Error('PAGE_ERROR_SENTINEL'); }, 0); }),
              ]);
            }
            return route(url, handler, options);
          };
        }
        if (state.mode === 'original') page.screenshot = async () => { throw new Error('SCREENSHOT_SENTINEL'); };
      });
      return context;
    };
    return browser;
  },
};
const test = createDebuggerTest(factories, async () => {
  if (['late-browser', 'late-seed'].includes(state.mode)) await bounded(async () => {
    while (state.mode === 'late-browser' ? !state.disconnected || await exists(state.traces) : !state.lateWritten || await exists(state.directory)) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }, 5000);
  await writeFile(join(process.env.HOME!, 'witness.json'), JSON.stringify({
    ...state, directoryExists: await exists(state.directory), tracesExist: await exists(state.traces), listening: await listening(),
  }));
});
registerDebuggerJourneys(test);
test.beforeEach(async ({ debuggerRun: _run }) => {
  state.between.push({ closed: state.closed, contexts: state.contexts, directoryExists: await exists(state.directory), listening: await listening() });
});
