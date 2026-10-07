import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

let browser: Browser, server: PreviewServer, origin: string;
beforeAll(async () => {
  server = await preview({ configFile: false, root: resolve('site'), preview: { host: '127.0.0.1', port: 0 } });
  origin = server.resolvedUrls!.local[0]!;
  browser = await chromium.launch({ headless: true });
  await mkdir('coverage/react-site', { recursive: true });
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done, reject) => server?.httpServer.close(error => error ? reject(error) : done()));
});

async function withPage(width: number, javaScriptEnabled: boolean, run: (page: Page, errors: string[]) => Promise<void>, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled, reducedMotion });
  const errors: string[] = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(origin).origin) {
      errors.push(`External request: ${route.request().url()}`); return route.abort();
    }
    return route.continue();
  });
  try { await run(await context.newPage(), errors); }
  finally { await context.close(); }
}

for (const width of [1280, 390]) test(`static React pages work without JavaScript at ${width}px`, async () => {
  await withPage(width, false, async (page, errors) => {
    await page.goto(origin);
    expect(await page.getByRole('heading', { name: 'Some actions never land.' }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Try pressing delete' }).count()).toBe(0);
    expect(await page.locator('[data-motion-control]').isVisible()).toBe(false);
    await page.getByText('Coverage & recording', { exact: true }).click();
    expect(await page.getByText(/That evidence may include code or secrets/).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Read the docs' }).click();
    expect(await page.getByRole('heading', { name: 'Use TENET in Pi.' }).isVisible()).toBe(true);
    expect(await page.locator('.language-sh').textContent()).toContain('\ncd /absolute/path/to/project\n');
    await page.getByRole('link', { name: 'Back to TENET' }).click();
    expect(await page.locator('#headline').isVisible()).toBe(true);
    expect(errors).toEqual([]);
  });
});

for (const width of [1280, 390]) test(`hydrated pages preserve layout, keyboard feedback and navigation at ${width}px`, async () => {
  await withPage(width, true, async (page, errors) => {
    await page.goto(origin);
    const key = page.getByRole('button', { name: 'Try pressing delete' });
    await key.waitFor();
    await key.focus(); await page.keyboard.press('Enter');
    await expect.poll(() => page.getByRole('status').textContent()).toContain('Attempt 1 blocked');
    await page.keyboard.press('Space');
    await expect.poll(() => page.getByRole('status').textContent()).toContain('Attempt 2 blocked');
    expect(await page.locator('[data-key]').getAttribute('transform')).toBe('translate(0 42.00)');
    const keyBounds = (await key.boundingBox())!, captionBounds = (await page.locator('.written-rule').boundingBox())!;
    expect(captionBounds.y).toBeGreaterThanOrEqual(keyBounds.y + keyBounds.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `coverage/react-site/home-${width}.png`, fullPage: true });
    await page.getByRole('link', { name: 'Read the docs' }).click();
    expect(await page.getByRole('heading', { name: 'Use TENET in Pi.' }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `coverage/react-site/docs-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
});

test('motion can pause, resume and settle safely when the motion preference changes', async () => {
  await withPage(1280, true, async (page, errors) => {
    await page.goto(origin);
    await page.getByRole('button', { name: 'Pause animation' }).click();
    await expect.poll(() => page.locator('[data-keypress]').getAttribute('data-motion')).toBe('paused');
    const paused = await page.locator('[data-key]').getAttribute('transform');
    await page.waitForTimeout(100);
    expect(await page.locator('[data-key]').getAttribute('transform')).toBe(paused);
    await page.getByRole('button', { name: 'Resume animation' }).click();
    const key = page.getByRole('button', { name: 'Try pressing delete' });
    for (let i = 0; i < 3; i++) await key.click();
    await expect.poll(() => page.getByRole('status').textContent()).toContain('Attempt 3 blocked');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Replay animation' }).waitFor();
    expect(await page.locator('[data-key]').getAttribute('transform')).toBe('translate(0 42.00)');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await page.locator('[data-keypress]').getAttribute('data-motion')).toBe('finished');
    await page.getByRole('button', { name: 'Replay animation' }).click();
    await page.getByRole('button', { name: 'Pause animation' }).waitFor();
    expect(errors).toEqual([]);
  }, 'no-preference');
});
