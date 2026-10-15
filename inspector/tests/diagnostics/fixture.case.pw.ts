import { chromium } from 'playwright';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { writeStageFile } from '../../../src/recording/files.js';
import { startInspector } from '../../../src/inspector/server.js';
import { join } from 'node:path';
import { createInspectorTest, expect } from '../playwright-fixture.js';
import type { InspectorFactories } from '../integration/fixture.js';

const state = { mode: process.env.TENET_DIAGNOSTIC_CASE!, directory: '', origin: '', contexts: 0, closed: 0, disconnected: false };
const factories: InspectorFactories = {
  start: async options => {
    state.directory = options.directory;
    const app = await startInspector(options);
    state.origin = app.origin;
    if (state.mode === 'late-server') await new Promise(resolve => setTimeout(resolve, 900));
    return { ...app, close: async () => {
      await app.close();
      if (['teardown', 'original'].includes(state.mode)) throw new Error('TEARDOWN_SENTINEL');
    } };
  },
  launch: async options => {
    if (state.mode === 'launch') throw new Error('LAUNCH_SENTINEL');
    const browser = await chromium.launch(options);
    browser.on('disconnected', () => { state.disconnected = true; });
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await newContext(options);
      state.contexts++;
      context.on('close', () => { state.closed++; });
      if (state.mode === 'late-context') await new Promise(resolve => setTimeout(resolve, 900));
      if (state.mode === 'late-trace') {
        const start = context.tracing.start.bind(context.tracing);
        context.tracing.start = async options => {
          await start(options);
          await new Promise(resolve => setTimeout(resolve, 1800));
        };
      }
      if (state.mode === 'navigation') context.on('page', page => {
        page.goto = async () => { throw new Error('NAVIGATION_SENTINEL'); };
      });
      if (state.mode === 'original') context.on('page', page => {
        page.screenshot = async () => { throw new Error('SCREENSHOT_SENTINEL'); };
      });
      if (state.mode === 'original') {
        const close = context.close.bind(context);
        context.close = async () => { await close(); throw new Error('CONTEXT_SENTINEL'); };
      }
      return context;
    };
    return browser;
  },
};

const test = createInspectorTest(factories, state.mode !== 'missing', async () => {
  if (state.mode === 'late-callback') await new Promise(resolve => setTimeout(resolve, 1200));
  const directoryExists = state.directory ? await access(state.directory).then(() => true, () => false) : false;
  const listening = state.origin ? await fetch(state.origin, { signal: AbortSignal.timeout(500) }).then(() => true, () => false) : false;
  await writeFile(join(process.env.HOME!, 'witness.json'), JSON.stringify({ ...state, directoryExists, listening }));
});

test(process.env.TENET_DIAGNOSTIC_NAME!, async ({ withInspector }) => {
  if (['late-server', 'late-context', 'late-seed', 'late-callback'].includes(state.mode)) test.setTimeout(500);
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
    if (state.mode === 'interrupted') await writeFile(join(process.env.HOME!, 'ready'), 'ready');
    if (['timeout', 'interrupted'].includes(state.mode)) await new Promise(() => {});
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
});
