import { afterAll, beforeAll, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { resolve } from 'node:path';

let browser: Browser, server: PreviewServer, origin: string;
beforeAll(async () => {
  server = await preview({ configFile: false, root: resolve('site'), preview: { host: '127.0.0.1', port: 0 } });
  origin = server.resolvedUrls!.local[0]!;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done, reject) => server?.httpServer.close(error => error ? reject(error) : done()));
});

const intact = '[\n  { "id": "example" }\n]';
const previews = ['write({ content: "[]" })', 'rm production/customers.json', 'Path(…).unlink()', 'find production … -delete'];

for (const width of [320, 390, 999, 1705]) for (const mode of ['normal', 'reduced', 'no-js'] as const) test(`one first-step header leads directly into the comparison at ${width}px with ${mode}`, async () => {
  const context = await browser.newContext({ viewport: { width, height: width === 1705 ? 1268 : 931 }, javaScriptEnabled: mode !== 'no-js', reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    const section = page.locator('#how-it-works'), scene = section.getByRole('figure'), header = scene.locator('.fork-heading');
    const heading = section.getByRole('heading', { level: 2, name: '1. Write your rule in TENET.md in plain text.', exact: true });
    expect(await heading.count()).toBe(1);
    expect(await heading.isVisible()).toBe(true);
    expect(await section.locator('h2, h3').count()).toBe(1);
    expect(await section.getByText(/Your policy\.|Same call\.|Different ending\./).count()).toBe(0);
    expect(await heading.getAttribute('id')).toBe('how-title');
    expect(await section.getAttribute('aria-labelledby')).toBe('how-title');
    expect(await scene.getAttribute('aria-labelledby')).toBe('how-title');
    expect(await page.locator('[id]').evaluateAll(elements => {
      const ids = elements.map(element => element.id);
      return new Set(ids).size === ids.length;
    })).toBe(true);
    expect(await header.locator('p').count()).toBe(0);
    expect(await page.getByText('TENET checks eligible Pi tool calls and reports findings to you, not the agent. The animation uses fictional data and runs no tools or assessments.', { exact: true }).count()).toBe(0);
    expect(await scene.locator('.fork-source > span').first().textContent()).toBe('Fictional Pi call · write');
    expect(await scene.locator('.fork-source > span').first().isVisible()).toBe(true);
    const link = header.getByRole('link', { name: 'Write your first rule' });
    expect(await link.getAttribute('href')).toBe('https://github.com/koenvg/Tenet/blob/main/docs/policy.md#write-a-first-rule');
    expect(await link.isVisible()).toBe(true);
    expect(await heading.locator('code').textContent()).toBe('TENET.md');
    expect(await heading.locator('code').evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    })).toBe(1);
    expect(await scene.evaluate(element => ({ margin: getComputedStyle(element).marginTop, padding: getComputedStyle(element).paddingTop, border: getComputedStyle(element).borderTopWidth }))).toEqual({ margin: '0px', padding: '0px', border: '0px' });
    const headerBounds = (await header.boundingBox())!, source = (await scene.locator('.fork-source').boundingBox())!;
    expect(source.y - headerBounds.y - headerBounds.height).toBeCloseTo(width <= 700 ? 32 : 40, 1);
    const title = (await heading.boundingBox())!;
    if (mode === 'no-js') expect(await scene.getByRole('button').count()).toBe(0);
    else {
      const control = scene.getByRole('button');
      await control.waitFor();
      const button = (await control.boundingBox())!;
      expect(await scene.getByRole('button').count()).toBe(1);
      expect(button.width).toBe(44);
      expect(button.height).toBe(44);
      expect(button.x).toBeGreaterThanOrEqual(title.x + title.width + 12);
      expect(button.y).toBeGreaterThanOrEqual(title.y);
      expect(button.y + button.height).toBeLessThanOrEqual(title.y + title.height);
      await control.focus();
      expect(await control.evaluate(element => element === document.activeElement && element.matches(':focus-visible') && getComputedStyle(element).outlineStyle === 'solid')).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(title.x).toBeGreaterThanOrEqual(0);
    expect(title.x + title.width).toBeLessThanOrEqual(width);
  } finally { await context.close(); }
});
for (const width of [320, 390, 640, 701, 900, 999, 1280]) test(`the fork compares four fictional calls without motion at ${width}px`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 931 }, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    const scene = page.locator('.fork-demonstration'), control = scene.getByRole('button');
    await control.waitFor();
    expect(await page.locator('.anatomy-demonstration, .policy-rig, .policy-file').count()).toBe(0);
    const bounds = (await scene.boundingBox())!;
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    for (let route = 0; route < 4; route++) {
      expect(await scene.locator('.fork-preview').textContent()).toBe(previews[route]);
      expect(await scene.locator('.fork-data-without').textContent()).toBe(route === 0 ? '[]' : 'File removed');
      expect(await scene.locator('.fork-data-with').textContent()).toBe(intact);
      expect(await control.getAttribute('aria-label')).toBe('Show with TENET');
      await control.focus();
      await page.keyboard.press('Enter');
      expect(await scene.locator('.fork-verdict').textContent()).toBe('Would block');
      expect(await scene.locator('.fork-rule').textContent()).toBe('Never delete production data.');
      expect(await scene.locator('.fork-data-with').textContent()).toBe(intact);
      expect(await control.evaluate(element => element === document.activeElement && element.matches(':focus-visible'))).toBe(true);
      expect(await scene.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      expect((await scene.boundingBox())!.height).toBeCloseTo(bounds.height, 1);
      await page.keyboard.press('Space');
    }
    expect(await scene.locator('.fork-preview').textContent()).toBe(previews[0]);
    expect(await page.locator('#how-it-works figure').count()).toBe(1);
    expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual(storage);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await control.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await scene.getByText('Enforce mode · opt-in', { exact: true }).isVisible()).toBe(true);
    if (width <= 700) {
      const headings = (await scene.locator('.fork-branch-headings').boundingBox())!;
      expect(headings.y + headings.height).toBeLessThanOrEqual((await scene.locator('.fork-circuit').boundingBox())!.y);
    }
  } finally { await context.close(); }
});

test('without JavaScript the completed fork has both readable outcomes and no inert control', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    const scene = page.locator('.fork-demonstration');
    expect(await scene.getByRole('heading', { name: '1. Write your rule in TENET.md in plain text.' }).isVisible()).toBe(true);
    expect(await scene.locator('.fork-data-without').textContent()).toBe('[]');
    expect(await scene.locator('.fork-data-with').textContent()).toBe(intact);
    expect(await scene.locator('.fork-verdict').textContent()).toBe('Would block');
    expect(await scene.getByRole('button').count()).toBe(0);
    expect(await scene.locator('.fork-rule').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Georgia');
    expect(await scene.locator('.fork-source').evaluate(element => element.previousElementSibling?.className)).toBe('fork-heading');
    expect(await page.locator('#how-it-works figure').count()).toBe(1);
  } finally { await context.close(); }
});

async function finish(page: Page, phase: string) {
  await page.locator('.fork-circuit').evaluate(async element => {
    const animation = element.getAnimations()[0];
    await animation.ready;
    animation.finish();
  });
  await expect.poll(() => page.locator('.fork-demonstration').getAttribute('data-fork-phase')).toBe(phase);
}

test('the actual fork draws to the data or the rule and wraps all four examples', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 931 }, reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    const scene = page.locator('.fork-demonstration');
    await scene.locator('.fork-circuit').scrollIntoViewIfNeeded();
    await expect.poll(() => scene.getAttribute('data-fork-playback')).toBe('playing');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(1);
    for (let route = 0; route < 4; route++) {
      expect(await scene.locator('.fork-preview').textContent()).toBe(previews[route]);
      await page.locator('.fork-circuit').evaluate(async element => {
        const animation = element.getAnimations()[0];
        await animation.ready;
        animation.currentTime = 500;
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
      expect(await scene.locator('.fork-data-without').textContent()).toBe(intact);
      await page.locator('.fork-circuit').evaluate(async element => {
        const animation = element.getAnimations()[0];
        animation.currentTime = 1250;
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
      expect(await scene.locator('[data-fork-trace="without"]').evaluate(element => {
        const path = element as SVGPathElement, end = path.getPointAtLength(path.getTotalLength());
        return { x: end.x, y: end.y };
      })).toEqual({ x: 250, y: 316 });
      const wipe = await scene.locator('.fork-data-without').evaluate(element => parseFloat((element as HTMLElement).style.clipPath.split(' ').at(-1)!));
      expect(wipe).toBeGreaterThan(0);
      expect(wipe).toBeLessThan(100);
      expect(await scene.locator('.fork-data-with').textContent()).toBe(intact);
      await finish(page, 'lost');
      expect(await scene.locator('.fork-data-without').textContent()).toBe(route === 0 ? '[]' : 'File removed');
      await finish(page, 'installing');
      await finish(page, 'after');
      expect(await scene.locator('.fork-data-without').textContent()).toBe(route === 0 ? '[]' : 'File removed');
      await finish(page, 'blocked');
      expect(await scene.locator('.fork-verdict').textContent()).toBe('Would block');
      expect(await scene.locator('.fork-data-with').textContent()).toBe(intact);
      expect(await scene.locator('[data-fork-trace="with"]').evaluate(element => {
        const path = element as SVGPathElement;
        const end = path.getPointAtLength(path.getTotalLength());
        return { x: end.x, y: end.y };
      })).toEqual({ x: 750, y: 186 });
      expect(await scene.locator('[data-fork-trace="with"]').evaluate(element => getComputedStyle(element).strokeDasharray)).toBe('none');
      expect(await scene.locator('[data-fork-stop]').getAttribute('visibility')).toBe('visible');
      await finish(page, 'before');
    }
    expect(await scene.locator('.fork-preview').textContent()).toBe(previews[0]);
  } finally { await context.close(); }
});

test('fork pause, offscreen, hidden and motion preference changes stop the real native clock', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 931 }, reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    const scene = page.locator('.fork-demonstration'), circuit = scene.locator('.fork-circuit'), control = scene.getByRole('button');
    await expect.poll(() => scene.getAttribute('data-fork-playback')).toBe('waiting');
    expect(await circuit.evaluate(element => element.getAnimations().length)).toBe(0);
    await circuit.scrollIntoViewIfNeeded();
    await expect.poll(() => scene.getAttribute('data-fork-playback')).toBe('playing');
    const state = () => scene.evaluate(async element => {
      const animations = element.getAnimations({ subtree: true });
      await Promise.all(animations.map(animation => animation.ready));
      return { times: animations.map(animation => Number(animation.currentTime)), circuit: element.querySelector('.fork-circuit')!.innerHTML, data: element.querySelector('.fork-data-without')!.textContent };
    });
    await control.focus();
    await page.keyboard.press('Enter');
    expect(await control.getAttribute('aria-label')).toBe('Resume comparison');
    const paused = await state();
    await page.waitForTimeout(180);
    expect(await state()).toEqual(paused);
    await control.click();
    await expect.poll(async () => (await state()).times[0]).toBeGreaterThan(paused.times[0]);
    await circuit.evaluate(element => scrollTo({ top: scrollY + element.getBoundingClientRect().bottom + 4, behavior: 'instant' }));
    await page.waitForTimeout(100);
    const offscreen = await state();
    await page.waitForTimeout(180);
    expect(await state()).toEqual(offscreen);
    await circuit.scrollIntoViewIfNeeded();
    const exact = await circuit.evaluate(async element => {
      const animation = element.getAnimations()[0];
      await animation.ready;
      animation.currentTime = 337.25;
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      const immediate = Number(animation.currentTime);
      await animation.ready;
      return [immediate, Number(animation.currentTime)];
    });
    expect(exact).toEqual([337.25, 337.25]);
    const hidden = await state();
    await page.waitForTimeout(180);
    expect(await state()).toEqual(hidden);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await control.focus();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => scene.getAttribute('data-fork-playback')).toBe('static');
    expect((await state()).times).toEqual([]);
    expect(await scene.locator('.fork-verdict').textContent()).toBe('Would block');
    expect(await control.evaluate(element => element === document.activeElement)).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect((await state()).times).toEqual([]);
    await control.click();
    expect(await scene.getAttribute('data-fork-playback')).toBe('playing');
  } finally { await context.close(); }
});

for (const width of [320, 390, 999, 1280, 1705]) test(`the fork reserves its layout before hydration at ${width}px`, async () => {
  const context = await browser.newContext({ viewport: { width, height: width === 1705 ? 1268 : 931 }, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    let hydrate!: () => void;
    const hydration = new Promise<void>(resolve => { hydrate = resolve; });
    await page.route('**/*.js', async route => { await hydration; await route.continue(); });
    await page.goto(origin, { waitUntil: 'commit' });
    const scene = page.locator('.fork-demonstration');
    await scene.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const selectors = ['.fork-demonstration', '.fork-heading', '#how-title', '#how-title code', '.fork-heading a', '.fork-source'];
    const before = await Promise.all(selectors.map(selector => page.locator(selector).boundingBox()));
    hydrate();
    await scene.getByRole('button').waitFor();
    const after = await Promise.all(selectors.map(selector => page.locator(selector).boundingBox()));
    for (let index = 0; index < selectors.length; index++) {
      expect(after[index]!.height).toBeCloseTo(before[index]!.height, 1);
      expect(after[index]!.width).toBeCloseTo(before[index]!.width, 1);
      expect(after[index]!.y).toBeCloseTo(before[index]!.y, 1);
      expect(after[index]!.x).toBeCloseTo(before[index]!.x, 1);
    }
  } finally { await context.close(); }
});
