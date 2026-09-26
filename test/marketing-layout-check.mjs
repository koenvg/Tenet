// Run with: bun test/marketing-layout-check.mjs
// Set TENET_CHROMIUM_PATH if Playwright's bundled Chromium is unavailable.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const pageUrl = pathToFileURL(`${import.meta.dir}/../site/index.html`).href;
const sizes = [
  [1440, 900],
  [1440, 500],
  [1440, 400],
  [1101, 400],
  [390, 844],
  [320, 640],
];

const browser = await chromium.launch({
  executablePath: process.env.TENET_CHROMIUM_PATH || undefined,
  headless: true,
});

try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.goto(pageUrl);
      await page.evaluate(() => document.fonts.ready);
      const [hero, actions, limit, next] = await Promise.all([
        page.locator(".first-screen").boundingBox(),
        page.locator(".hero-actions").boundingBox(),
        page.locator(".hero-limit").boundingBox(),
        page.locator(".explanation").boundingBox(),
      ]);
      assert.ok(hero && actions && limit && next, `missing layout at ${width}x${height}`);
      assert.ok(actions.y + actions.height + 16 <= limit.y, `actions overlap qualifier at ${width}x${height}`);
      assert.ok(limit.y + limit.height <= next.y + 1, `qualifier overlaps next section at ${width}x${height}`);
      assert.ok(actions.y + actions.height <= hero.y + hero.height, `actions leave hero at ${width}x${height}`);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (width === 1440 && height === 900) {
        const animation = await page.locator(".assessment").evaluate((element) => getComputedStyle(element, "::before").animationName);
        assert.equal(animation, "assessment-rule-in", "example rule should draw once on entry");
      }
      assert.ok(scrollWidth <= width, `horizontal overflow at ${width}x${height}`);
      if (width <= 1100) {
        const anchor = await page.locator(".assessment").evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.position, style.top, style.left, style.right];
        });
        assert.deepEqual(anchor, ["relative", "0px", "0px", "0px"], `example rule is misplaced at ${width}x${height}`);
      }
      console.log(`${width}x${height}: no overlap or overflow`);
    } finally {
      await page.close();
    }
  }
  const reducedPage = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await reducedPage.goto(pageUrl);
    const line = await reducedPage.locator(".assessment").evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      return { animation: style.animationName, border: style.borderTopWidth };
    });
    assert.equal(line.animation, "none", "reduced motion should keep the line static");
    assert.equal(line.border, "1px", "reduced motion should keep the line visible");
    console.log("reduced motion: static example rule");
  } finally {
    await reducedPage.close();
  }
} finally {
  await browser.close();
}
