import { aroundAll, beforeEach, vi } from 'vitest';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bounded } from './report.js';

const state = vi.hoisted(() => {
  let lateCleaned!: () => void;
  const lateCleanup = new Promise<void>(resolve => { lateCleaned = resolve; });
  return {
    mode: process.env.TENET_DIAGNOSTIC_CASE!, directory: '', origin: '', traces: '',
    launches: 0, seeds: 0, servers: 0, contexts: 0, closed: 0, disconnected: false,
    lateWritten: false, lateCleanup, lateCleaned,
    between: [] as Array<{ closed: number; contexts: number; directoryExists: boolean; listening: boolean }>,
  };
});
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdtemp: async (prefix: string) => {
    const path = await actual.mkdtemp(prefix);
    if (prefix.endsWith('tenet-playwright-')) state.directory = path;
    return path;
  }, rm: async (...args: Parameters<typeof actual.rm>) => {
    await actual.rm(...args);
    if ((state.mode === 'late-seed' && state.lateWritten && args[0] === state.directory)
      || (state.mode === 'late-browser' && state.disconnected && args[0] === state.traces)) state.lateCleaned();
  } };
});
vi.mock('../browser-fixture.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../browser-fixture.js')>();
  return { ...actual, browserFixture: async (directory: string) => {
    state.directory = directory; state.seeds++;
    if (state.mode === 'late-seed') {
      await new Promise(resolve => setTimeout(resolve, 33_000));
      const { mkdir } = await import('node:fs/promises');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'late-synthetic.json'), '{}');
      state.lateWritten = true;
      return;
    }
    await actual.browserFixture(directory);
    if (state.mode === 'seed') throw new Error('SEED_SENTINEL');
  } };
});
vi.mock('../../../src/inspector/server.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/inspector/server.js')>();
  return { ...actual, startInspector: async (options: Parameters<typeof actual.startInspector>[0]) => {
    const app = await actual.startInspector(options);
    state.origin = app.origin; state.servers++;
    return { ...app, close: async () => {
      await app.close();
      if (state.mode === 'teardown') throw new Error('TEARDOWN_SENTINEL');
    } };
  } };
});
vi.mock('playwright', async importOriginal => {
  const actual = await importOriginal<typeof import('playwright')>();
  return { ...actual, chromium: { ...actual.chromium, launch: async (options: Parameters<typeof actual.chromium.launch>[0]) => {
    state.launches++; state.traces = options?.tracesDir ?? '';
    if (state.mode === 'launch') throw new Error('LAUNCH_SENTINEL');
    if (state.mode === 'late-browser') await new Promise(resolve => setTimeout(resolve, 33_000));
    const browser = await actual.chromium.launch(options);
    browser.on('disconnected', () => { state.disconnected = true; });
    const newContext = browser.newContext.bind(browser);
    vi.spyOn(browser, 'newContext').mockImplementation(async options => {
      const context = await newContext(options);
      state.contexts++;
      context.on('close', () => { state.closed++; });
      if (['late-pageerror', 'late-guard'].includes(state.mode)) {
        const stop = context.tracing.stop.bind(context.tracing);
        vi.spyOn(context.tracing, 'stop').mockImplementation(async options => {
          const page = context.pages()[0]!;
          if (state.mode === 'late-guard') await page.goto('https://fixture.invalid/probe?token=QUERY_SENTINEL').catch(() => {});
          else await Promise.all([
            page.waitForEvent('pageerror'),
            page.evaluate(() => { setTimeout(() => { throw new Error('PAGE_ERROR_SENTINEL'); }, 0); }),
          ]);
          await stop(options);
        });
      }
      if (['context-close', 'original'].includes(state.mode)) {
        const close = context.close.bind(context);
        vi.spyOn(context, 'close').mockImplementation(async () => { await close(); throw new Error('CONTEXT_SENTINEL'); });
      }
      context.on('page', page => {
        if (state.mode === 'navigation') vi.spyOn(page, 'goto').mockRejectedValue(new Error('NAVIGATION_SENTINEL'));
        if (['callback', 'original', 'timeout', 'guard', 'pageerror'].includes(state.mode)) {
          const route = page.route.bind(page);
          vi.spyOn(page, 'route').mockImplementation(async (url, handler, options) => {
            if (url instanceof RegExp) {
              if (state.mode === 'timeout') await new Promise(() => {});
              if (['callback', 'original', 'timeout'].includes(state.mode)) throw new Error('CALLBACK_SENTINEL');
              if (state.mode === 'guard') await page.goto('https://fixture.invalid/probe?token=QUERY_SENTINEL').catch(() => {});
              if (state.mode === 'pageerror') await Promise.all([
                page.waitForEvent('pageerror'),
                page.evaluate(() => { setTimeout(() => { throw new Error('PAGE_ERROR_SENTINEL'); }, 0); }),
              ]);
            }
            return route(url, handler, options);
          });
        }
        if (state.mode === 'original') vi.spyOn(page, 'screenshot').mockRejectedValue(new Error('SCREENSHOT_SENTINEL'));
      });
      return context;
    });
    return browser;
  } } };
});

const exists = (path: string) => path ? access(path).then(() => true, () => false) : Promise.resolve(false);
const listening = () => state.origin ? fetch(state.origin, { signal: AbortSignal.timeout(500) }).then(response => { void response.body?.cancel(); return true; }, () => false) : Promise.resolve(false);
aroundAll(async runSuite => {
  try { await runSuite(); }
  finally {
    if (['late-browser', 'late-seed'].includes(state.mode)) await bounded(() => state.lateCleanup, 5000);
    await writeFile(join(process.env.HOME!, 'witness.json'), JSON.stringify({
      ...state, directoryExists: await exists(state.directory), tracesExist: await exists(state.traces), listening: await listening(),
    }));
  }
});
await import('../debugger.vitest.js');
beforeEach(async () => {
  state.between.push({ closed: state.closed, contexts: state.contexts, directoryExists: await exists(state.directory), listening: await listening() });
});
