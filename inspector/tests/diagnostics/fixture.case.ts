import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { writeStageFile } from '../../../src/recording/files.js';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ mode: process.env.TENET_DIAGNOSTIC_CASE!, directory: '', origin: '', contexts: 0, closed: 0, disconnected: false }));
vi.mock('../../../src/inspector/server.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/inspector/server.js')>();
  return { ...actual, startInspector: async (options: Parameters<typeof actual.startInspector>[0]) => {
    state.directory = options.directory;
    const app = await actual.startInspector(options);
    state.origin = app.origin;
    if (state.mode === 'late-server') await new Promise(resolve => setTimeout(resolve, 900));
    return { ...app, close: async () => {
      await app.close();
      if (['teardown', 'original'].includes(state.mode)) throw new Error('TEARDOWN_SENTINEL');
    } };
  } };
});
vi.mock('playwright', async importOriginal => {
  const actual = await importOriginal<typeof import('playwright')>();
  return { ...actual, chromium: { ...actual.chromium, launch: async (options: Parameters<typeof actual.chromium.launch>[0]) => {
    if (state.mode === 'launch') throw new Error('LAUNCH_SENTINEL');
    const browser = await actual.chromium.launch(options);
    browser.on('disconnected', () => { state.disconnected = true; });
    const newContext = browser.newContext.bind(browser);
    vi.spyOn(browser, 'newContext').mockImplementation(async options => {
      const context = await newContext(options);
      state.contexts++;
      context.on('close', () => { state.closed++; });
      if (state.mode === 'late-context') await new Promise(resolve => setTimeout(resolve, 900));
      if (state.mode === 'late-trace') {
        const start = context.tracing.start.bind(context.tracing);
        vi.spyOn(context.tracing, 'start').mockImplementation(async options => {
          await start(options);
          await new Promise(resolve => setTimeout(resolve, 1800));
        });
      }
      if (state.mode === 'navigation') context.on('page', page => {
        vi.spyOn(page, 'goto').mockRejectedValue(new Error('NAVIGATION_SENTINEL'));
      });
      if (state.mode === 'original') context.on('page', page => {
        vi.spyOn(page, 'screenshot').mockRejectedValue(new Error('SCREENSHOT_SENTINEL'));
      });
      if (state.mode === 'original') {
        const close = context.close.bind(context);
        vi.spyOn(context, 'close').mockImplementation(async () => { await close(); throw new Error('CONTEXT_SENTINEL'); });
      }
      return context;
    });
    return browser;
  } } };
});

import { closeBrowser, launchBrowser, withInspector } from '../integration/fixture.js';
if (state.mode !== 'missing') beforeAll(launchBrowser);
afterAll(async () => {
  await closeBrowser();
  if (state.mode === 'late-callback') await new Promise(resolve => setTimeout(resolve, 1200));
  const directoryExists = state.directory ? await access(state.directory).then(() => true, () => false) : false;
  const listening = state.origin ? await fetch(state.origin, { signal: AbortSignal.timeout(500) }).then(() => true, () => false) : false;
  await writeFile(join(process.env.HOME!, 'witness.json'), JSON.stringify({ ...state, directoryExists, listening }));
});

test(process.env.TENET_DIAGNOSTIC_NAME!, async () => {
  if (state.mode === 'reuse') await withInspector(`${process.env.TENET_DIAGNOSTIC_NAME!}-first`, async ({ page }) => {
    expect(await page.title()).toBe('TENET decision inspector');
  }, { base: false });
  await withInspector(process.env.TENET_DIAGNOSTIC_NAME!, async ({ page, directory, open }) => {
    state.directory = directory;
    if (state.mode === 'late-callback') {
      await new Promise(resolve => setTimeout(resolve, 900));
      await writeStageFile(directory, join(directory, 'synthetic-session'), 'late-stage', '{}');
      return;
    }
    if (state.mode === 'timeout') await new Promise(() => {});
    if (state.mode === 'bounds') {
      await page.evaluate(() => { for (let i = 0; i < 900; i++) console.warn('synthetic-' + 'x'.repeat(6000)); });
      for (let i = 0; i < 5; i++) await open();
    }
    if (state.mode === 'events') {
      await page.context().setExtraHTTPHeaders({ 'X-Synthetic-Header': 'HEADER_SENTINEL' });
      await page.context().addCookies([{ name: 'synthetic', value: 'COOKIE_SENTINEL', url: state.origin }]);
      await page.goto(`${state.origin}/?credential=QUERY_SENTINEL`);
      await page.evaluate(() => { console.warn('SYNTHETIC_CONSOLE'); });
      await Promise.all([page.waitForEvent('pageerror'), page.evaluate(() => { setTimeout(() => { throw new Error('PAGE_ERROR_SENTINEL'); }, 0); })]);
      await page.goto('https://fixture.invalid/blocked?token=QUERY_SENTINEL').catch(() => {});
    }
    if (['callback', 'original', 'bounds', 'reuse', 'events', 'late-trace'].includes(state.mode)) throw new Error('CALLBACK_SENTINEL');
    expect(await page.title()).toBe('TENET decision inspector');
  }, { base: false, seed: async directory => {
    state.directory = directory;
    if (state.mode === 'late-seed') {
      await new Promise(resolve => setTimeout(resolve, 900));
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'late-synthetic.json'), '{}');
    }
    if (state.mode === 'seed') throw new Error('SEED_SENTINEL');
  } });
}, ['late-server', 'late-context', 'late-seed', 'late-callback'].includes(state.mode) ? 500 : 20_000);
