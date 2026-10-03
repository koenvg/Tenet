import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startInspector } from '../../../src/inspector/server.js';
import { recordFixture } from '../../../test/recording-fixture.js';
import { browserFixture } from '../browser-fixture.js';

export type InspectorTest = {
  directory: string;
  app: Awaited<ReturnType<typeof startInspector>>;
  page: Page;
  externalRequests: string[];
  pageErrors: string[];
  recorded: Awaited<ReturnType<typeof recordFixture>> | undefined;
  open: (path?: string) => Promise<Page>;
};

let browser: Browser | undefined;
export async function launchBrowser() { browser = await chromium.launch({ headless: true }); }
export async function closeBrowser() { await browser?.close(); browser = undefined; }

export async function withInspector(
  testName: string,
  run: (fixture: InspectorTest) => Promise<void>,
  options: { base?: boolean; seed?: (directory: string) => Promise<void>; path?: string } = {},
) {
  if (!browser) throw new Error('Headless Chromium was not started');
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-inspector-integration-')));
  let app: Awaited<ReturnType<typeof startInspector>> | undefined;
  let context: BrowserContext | undefined;
  const externalRequests: string[] = [], pageErrors: string[] = [];
  try {
    const recorded = options.base === false ? undefined : await recordFixture(directory);
    if (options.base !== false) await browserFixture(directory);
    await options.seed?.(directory);
    app = await startInspector({ directory, assets: resolve('inspector/dist') });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const apiEvents: Array<{ elapsedMs: number; page: string; url: string; status: number }> = [];
    const started = Date.now();
    context.on('response', response => {
      if (new URL(response.url()).pathname.startsWith('/api/')) apiEvents.push({ elapsedMs: Date.now() - started,
        page: response.request().frame().page().url(), url: response.url(), status: response.status() });
    });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (new URL(url).origin === app!.origin) return route.continue();
      externalRequests.push(url); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    const origin = app.origin;
    const open = async (path = '/') => {
      const next = await context!.newPage();
      next.on('pageerror', error => pageErrors.push(error.message));
      await next.goto(new URL(path, origin).href);
      const linked = new URL(path, origin);
      if (/^[a-f0-9]{64}$/.test(linked.searchParams.get('invocation') ?? '')) {
        // A document load does not finish the asynchronous archive selection.
        await next.locator('.invocation').waitFor();
      }
      return next;
    };
    await page.goto(new URL(options.path ?? '/', origin).href);
    try {
      await run({ directory, app, page, externalRequests, pageErrors, recorded, open });
      if (externalRequests.length || pageErrors.length) throw new Error(`Unexpected browser requests/errors: ${JSON.stringify({ externalRequests, pageErrors })}`);
    } catch (error) {
      const artifacts = resolve('coverage/inspector-artifacts/playwright');
      await mkdir(artifacts, { recursive: true });
      const failure = await mkdtemp(join(artifacts, `failure-${testName.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}-`));
      await writeFile(join(failure, 'requests.json'), JSON.stringify({ apiEvents, externalRequests, pageErrors }, null, 2));
      for (const [number, failedPage] of context.pages().entries()) {
        await failedPage.screenshot({ path: join(failure, `page-${number}.png`), fullPage: true }).catch(() => {});
        await writeFile(join(failure, `page-${number}.html`), await failedPage.content()).catch(() => {});
      }
      throw error;
    }
  } finally {
    await context?.close();
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
