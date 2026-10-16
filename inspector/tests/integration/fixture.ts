import { chromium, type Browser, type Page } from 'playwright';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
export type InspectorLifecycle = { signal: AbortSignal; onFinish: (finish: (error?: unknown) => Promise<unknown>) => void };
import { startInspector } from '../../../src/inspector/server.js';
import { recordFixture } from '../../../test/recording-fixture.js';
import { browserFixture } from '../browser-fixture.js';
import { bounded, FixtureDiagnostics, TraceStore } from '../diagnostics/report.js';

export type InspectorFactories = { launch?: typeof chromium.launch; start?: typeof startInspector };
export type InspectorTest = {
  directory: string;
  app: Awaited<ReturnType<typeof startInspector>>;
  page: Page;
  externalRequests: string[];
  pageErrors: string[];
  recorded: Awaited<ReturnType<typeof recordFixture>> | undefined;
  open: (path?: string) => Promise<Page>;
};
type InspectorHost = Pick<InspectorTest, 'directory' | 'app' | 'recorded'>;
type ArchiveOptions = { base?: boolean; seed?: (directory: string) => Promise<void> };

let browser: Browser | undefined;
let browserGeneration = 0;
let traceStore: TraceStore | undefined;
export async function launchBrowser(factories: InspectorFactories = {}) {
  const diagnostics = new FixtureDiagnostics('browser-launch');
  const generation = ++browserGeneration;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), 'tenet-inspector-traces-'));
    const launched = await (factories.launch ?? chromium.launch.bind(chromium))({ headless: true, tracesDir: directory });
    if (generation !== browserGeneration) { await bounded(() => launched.close()); throw new Error('Browser launch completed after teardown'); }
    browser = launched;
    traceStore = new TraceStore(directory);
  } catch (error) {
    if (directory) await bounded(() => rm(directory!, { recursive: true, force: true })).catch(() => {});
    await diagnostics.finish(error);
    throw error;
  }
}
export async function closeBrowser() {
  browserGeneration++;
  const ownedBrowser = browser, ownedStore = traceStore;
  browser = undefined; traceStore = undefined;
  const diagnostics = new FixtureDiagnostics('browser-close');
  if (ownedStore) diagnostics.own('browser trace store', () => rm(ownedStore.directory, { recursive: true, force: true }));
  if (ownedBrowser) diagnostics.own('browser', () => ownedBrowser.close());
  const error = await diagnostics.finish();
  if (error !== undefined) throw error;
}

async function createInspectorHost(diagnostics: FixtureDiagnostics, factories: InspectorFactories, options: ArchiveOptions): Promise<InspectorHost> {
  diagnostics.enter('setup.archive');
  const directory = await diagnostics.acquire('synthetic archive', async () => {
    const path = await mkdtemp(join(tmpdir(), 'tenet-inspector-integration-'));
    try { return await realpath(path); }
    catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
  }, path => rm(path, { recursive: true, force: true }));
  const prepare = <T>(operation: Promise<T>) => diagnostics.prepare(operation, () => rm(directory, { recursive: true, force: true }));
  const recorded = options.base === false ? undefined : await prepare(recordFixture(directory));
  if (options.base !== false) await prepare(browserFixture(directory));
  diagnostics.enter('setup.seed');
  await prepare(Promise.resolve(options.seed?.(directory)));
  diagnostics.enter('setup.server');
  const app = await diagnostics.acquire('local server', () => (factories.start ?? startInspector)({ directory, assets: resolve('inspector/dist') }), app => app.close());
  diagnostics.server(app.origin);
  return { directory, app, recorded };
}

export async function withInspector(
  lifecycle: InspectorLifecycle,
  factories: InspectorFactories,
  testName: string,
  run: (fixture: InspectorTest) => Promise<void>,
  options: ArchiveOptions & { path?: string } = {},
) {
  const diagnostics = new FixtureDiagnostics(testName, lifecycle.signal, browser);
  lifecycle.onFinish(error => diagnostics.finish(error));
  try {
    if (!browser || !traceStore) throw new Error('Headless Chromium was not started');
    const { directory, app, recorded } = await createInspectorHost(diagnostics, factories, options);
    const prepare = <T>(operation: Promise<T>) => diagnostics.prepare(operation, () => rm(directory, { recursive: true, force: true }));
    diagnostics.server(app.origin);
    diagnostics.enter('setup.context');
    const context = await diagnostics.acquire('browser context', () => browser!.newContext({ baseURL: app.origin, viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), context => context.close());
    await diagnostics.wait(diagnostics.observe(browser, context, app.origin, traceStore));
    const externalRequests: string[] = [], pageErrors: string[] = [];
    context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
    await diagnostics.wait(context.route('**/*', route => {
      const url = route.request().url();
      if (new URL(url).origin === app.origin) return route.continue();
      externalRequests.push(url);
      return route.abort();
    }));
    const page = await diagnostics.wait(context.newPage());
    const navigate = async (page: Page, path: string) => {
      diagnostics.enter('navigation');
      await diagnostics.wait(page.goto(new URL(path, app.origin).href));
    };
    const open = async (path = '/') => {
      diagnostics.check();
      const next = await diagnostics.wait(context.newPage());
      await navigate(next, path);
      const linked = new URL(path, app.origin);
      if (/^[a-f0-9]{64}$/.test(linked.searchParams.get('invocation') ?? '')) {
        // A document load does not finish the asynchronous archive selection.
        await diagnostics.wait(next.locator('dialog[open] .invocation').waitFor());
      } else if (/^[a-f0-9]{64}$/.test(linked.searchParams.get('rule') ?? '')) {
        await diagnostics.wait(next.locator('dialog[open] .rule-panel-body h3').waitFor());
      } else {
        await diagnostics.wait(next.getByRole('heading', { name: 'Did this session follow the rules?' }).waitFor());
      }
      diagnostics.enter('test');
      return next;
    };
    await navigate(page, options.path ?? '/');
    diagnostics.enter('test');
    await prepare(run({ directory, app, page, externalRequests, pageErrors, recorded, open }));
    if (externalRequests.length || pageErrors.length) throw new Error(`Unexpected browser requests/errors: ${JSON.stringify({ externalRequests, pageErrors })}`);
  } catch (error) {
    await diagnostics.finish(error);
    throw error;
  }
  const error = await diagnostics.finish();
  if (error !== undefined) throw error;
}
