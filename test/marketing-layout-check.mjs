// Run with: TENET_BROWSER_CDP_URL=http://127.0.0.1:9222 bun test/marketing-layout-check.mjs
// Without CDP, uses Playwright Chromium (TENET_CHROMIUM_PATH can override its path).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";

const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/docs.html", ["docs.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/hero.js", ["hero.js", "text/javascript"]],
  ["/fonts/Geist-latin.woff2", ["fonts/Geist-latin.woff2", "font/woff2"]],
]);
const server = createServer(async (request, response) => {
  const asset = assets.get(new URL(request.url, "http://localhost").pathname);
  try {
    if (!asset) throw new Error("Not a site asset");
    const body = await readFile(new URL(`../site/${asset[0]}`, import.meta.url));
    response.writeHead(200, { "Content-Type": asset[1] }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
assert.equal((await fetch(base)).status, 200, "preview server must be ready");
let browser;

async function withPage(options, check) {
  const context = await browser.newContext({ reducedMotion: "no-preference", ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await check(page);
    assert.deepEqual(errors, [], "website must not produce browser errors");
  } finally {
    await context.close();
  }
}

try {
  browser = process.env.TENET_BROWSER_CDP_URL
    ? await chromium.connectOverCDP(process.env.TENET_BROWSER_CDP_URL, { noDefaults: true, timeout: 10000 })
    : await chromium.launch({ executablePath: process.env.TENET_CHROMIUM_PATH || undefined, headless: true });

  await withPage({ viewport: { width: 1440, height: 1100 } }, async (page) => {
    await page.clock.install();
    await page.goto(base);
    const pause = page.getByRole("button", { name: "Pause animation", exact: true });
    await pause.waitFor({ state: "visible" });
    await page.clock.runFor(1200);
    assert.equal(await page.locator("[data-blocked]").evaluate((element) => getComputedStyle(element).opacity), "0", "blocked label stays hidden while the key approaches");
    await pause.click();
    const scene = page.getByRole("img", { name: "The delete key never makes contact" });
    const stopped = await scene.innerHTML();
    await page.clock.runFor(1000);
    assert.equal(await scene.innerHTML(), stopped, "pause must freeze the key");
    await page.getByRole("button", { name: "Resume animation", exact: true }).press("Enter");
    await page.clock.runFor(3000);
    await page.getByRole("button", { name: "Replay animation", exact: true }).waitFor();
    assert.equal(await page.locator("[data-hero-status]").textContent(), "Delete blocked before execution. Finding reported.");
    assert.equal(await page.locator("[data-hero-status]").evaluate((element) => getComputedStyle(element).opacity), "1", "the finding is visible at completion");
    assert.equal(await page.locator("[data-blocked] text").textContent(), "Blocked");
    assert.equal(await page.locator("[data-blocked]").evaluate((element) => getComputedStyle(element).opacity), "1", "blocked label is clearly visible after the stop");
    assert.equal(await page.locator("[data-key]").getAttribute("transform"), "translate(0 42.00)", "key holds above the contact plate within four seconds");
    const finished = await scene.innerHTML();
    await page.clock.runFor(12000);
    assert.equal(await scene.innerHTML(), finished, "animation must hold the final frame, not loop");
    await page.getByRole("button", { name: "Replay animation", exact: true }).click();
    await pause.waitFor();
    assert.notEqual(await scene.innerHTML(), finished, "replay starts the journey again");
    console.log("motion: pause, resume, single play, final finding, replay");
  });

  await withPage({ viewport: { width: 390, height: 844 } }, async (page) => {
    await page.clock.install();
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(4300);
    await page.getByRole("button", { name: "Replay animation", exact: true }).waitFor();
    const button = page.getByRole("button", { name: "Try pressing delete", exact: true });
    const key = page.locator("[data-key]");
    const resting = await key.boundingBox();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await button.click();
    await page.clock.runFor(140);
    const pressed = await key.boundingBox();
    assert.ok(pressed.y > resting.y + 4, "clicking the key produces a visible downward press");
    if (process.env.TENET_SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.TENET_SCREENSHOT_DIR}/keypress-pressed.png`, fullPage: true });
    }
    assert.equal(await page.locator("[data-blocked]").evaluate((element) => getComputedStyle(element).opacity), "1", "the action remains blocked while pressing");
    assert.equal(await page.getByRole("status").textContent(), "Attempt 1 blocked by your example rule. No action was executed.");
    await page.clock.runFor(600);
    assert.ok(Math.abs((await key.boundingBox()).y - resting.y) < 0.1, "the key springs back to its original blocked position");
    assert.deepEqual(requests, [], "trying the demo must not send a tool call or network request");
    console.log("interactive key: click dips and returns, reports a block, performs no action");
  });

  await withPage({ viewport: { width: 390, height: 844 }, hasTouch: true }, async (page) => {
    await page.clock.install();
    await page.goto(base);
    const button = page.getByRole("button", { name: "Try pressing delete", exact: true });
    const key = page.locator("[data-key]");
    await page.clock.runFor(500);
    await button.focus();
    assert.notEqual(await button.evaluate((element) => getComputedStyle(element).outlineStyle), "none", "keyboard focus is visible");
    await button.press("Enter");
    await page.clock.runFor(600);
    const resting = await key.boundingBox();
    assert.equal(await page.getByRole("status").textContent(), "Attempt 1 blocked by your example rule. No action was executed.");
    await button.press("Space");
    await page.clock.runFor(140);
    assert.ok((await key.boundingBox()).y > resting.y + 4, "Space presses the key too");
    await page.getByRole("button", { name: "Pause animation", exact: true }).click();
    const paused = await key.boundingBox();
    await page.clock.runFor(600);
    assert.deepEqual(await key.boundingBox(), paused, "pause freezes an interactive press");
    await page.getByRole("button", { name: "Resume animation", exact: true }).click();
    await page.clock.runFor(600);
    for (let i = 0; i < 3; i++) {
      await button.tap();
      await page.clock.runFor(50);
    }
    await page.clock.runFor(600);
    assert.equal(await page.getByRole("status").textContent(), "Attempt 5 blocked by your example rule. No action was executed.");
    assert.deepEqual(await key.boundingBox(), resting, "rapid attempts settle instead of stacking animations");
    await page.clock.runFor(1500);
    assert.deepEqual(await key.boundingBox(), resting, "no queued press runs after settling");
    await page.getByRole("button", { name: "Replay animation", exact: true }).click();
    await page.clock.runFor(4300);
    assert.deepEqual(await key.boundingBox(), resting, "the original replay still works after interaction");
    console.log("interactive key: Enter, Space, touch, early attempt, pause/resume and rapid retries");
  });

  await withPage({ reducedMotion: "reduce" }, async (page) => {
    await page.clock.install();
    await page.goto(base);
    const button = page.getByRole("button", { name: "Try pressing delete", exact: true });
    const key = page.locator("[data-key]");
    const resting = await key.boundingBox();
    await button.click();
    await page.clock.runFor(140);
    assert.deepEqual(await key.boundingBox(), resting, "reduced-motion attempts report the block without movement");
    assert.equal(await page.getByRole("status").textContent(), "Attempt 1 blocked by your example rule. No action was executed.");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await button.click();
    await page.clock.runFor(140);
    assert.ok((await key.boundingBox()).y > resting.y + 4);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Replay animation", exact: true }).waitFor();
    assert.deepEqual(await key.boundingBox(), resting, "enabling reduced motion also stops an interactive press");
    console.log("interactive key: reduced motion keeps feedback but skips movement");
  });

  await withPage({ viewport: { width: 390, height: 500 } }, async (page) => {
    await page.goto(base);
    await page.addStyleTag({ content: "html { scroll-behavior: auto; }" });
    const scene = page.getByRole("img", { name: "The delete key never makes contact" });
    await page.waitForTimeout(250);
    await page.locator(".coverage").evaluate((element) => { element.open = true; });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => document.querySelector(".keypress-art").getBoundingClientRect().bottom < 0);
    // IntersectionObserver needs a real browser rendering turn, not only a mocked clock tick.
    await page.waitForTimeout(100);
    const offscreen = await scene.innerHTML();
    await page.waitForTimeout(500);
    assert.equal(await scene.innerHTML(), offscreen, "offscreen motion must suspend");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    assert.notEqual(await scene.innerHTML(), offscreen, "returning onscreen resumes motion");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hidden = await scene.innerHTML();
    await page.waitForTimeout(500);
    assert.equal(await scene.innerHTML(), hidden, "hidden documents must suspend motion");
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(250);
    assert.notEqual(await scene.innerHTML(), hidden, "visible documents resume motion");
    console.log("suspension: offscreen and simulated hidden document freeze and resume");
  });

  for (const [width, height] of [[1440, 900], [1440, 500], [1101, 400], [768, 1024], [390, 844], [320, 640]]) {
    await withPage({ viewport: { width, height }, reducedMotion: "reduce" }, async (page) => {
      await page.goto(base);
      await page.evaluate(() => document.fonts.ready);
      const [hero, copy, art, rule, actions, limit, next] = await Promise.all(
        Array.of(".first-screen", ".hero-copy", ".keypress-art", ".written-rule", ".hero-actions", ".hero-limit", ".explanation")
          .map((selector) => page.locator(selector).boundingBox()),
      );
      assert.ok(hero && copy && art && rule && actions && limit && next, "hero content must have a layout");
      assert.ok(copy.y + copy.height <= art.y, "animation is below the heading, not a side example");
      assert.ok(art.y + art.height <= rule.y + 1, "animation must not cover the owner's rule");
      const badge = await page.locator("[data-blocked]").boundingBox();
      assert.ok(badge && badge.x >= art.x && badge.x + badge.width <= art.x + art.width, "blocked label stays within the illustration at every viewport");
      assert.ok(rule.y + rule.height <= actions.y, "rule must not cover the CTA");
      assert.ok(actions.y + actions.height + 16 <= limit.y, "CTA must not cover the mode qualifier");
      assert.ok(limit.y + limit.height <= next.y, "qualifier must not cover the next section");
      assert.ok(actions.y + actions.height <= hero.y + hero.height, "CTA stays inside the hero");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
      if (width === 1440 && height === 900) assert.ok(actions.y + actions.height <= height, "desktop CTA is in the first viewport");
      if (process.env.TENET_SCREENSHOT_DIR && (width === 390 || (width === 1440 && height === 900))) {
        await page.screenshot({ path: `${process.env.TENET_SCREENSHOT_DIR}/keypress-${width}.png`, fullPage: true });
      }
      await page.locator(".coverage summary").focus();
      await page.keyboard.press("Enter");
      assert.ok(await page.getByText("TENET_RECORDING=off", { exact: true }).isVisible(), "recording disclosure is keyboard-accessible");
      console.log(`${width}x${height}: hero, rule, CTA and limits have no overlap or overflow`);
    });
  }

  await withPage({ reducedMotion: "reduce" }, async (page) => {
    await page.goto(base);
    const squareTips = await page.locator("[data-key]").evaluate((key) => {
      const sides = Array.from(key.children).filter((element) => element.tagName === "path");
      // These points were inside the square side-face tips, outside the rounded cap.
      const corners = [new DOMPoint(349, 126), new DOMPoint(715, 169)];
      return corners.map((point) => sides.some((side) => side.isPointInFill(point)));
    });
    assert.deepEqual(squareTips, [false, false], "the side faces must not protrude beyond the rounded keycap");
    console.log("keycap: no square side-face tips beyond the rounded top");
  });

  await withPage({ reducedMotion: "reduce" }, async (page) => {
    await page.clock.install();
    await page.goto(base);
    await page.getByRole("button", { name: "Replay animation", exact: true }).waitFor();
    const scene = page.getByRole("img", { name: "The delete key never makes contact" });
    const original = await scene.innerHTML();
    await page.clock.runFor(10000);
    assert.equal(await scene.innerHTML(), original, "reduced motion starts at the static completed scene");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "Replay animation", exact: true }).click();
    await page.clock.runFor(1200);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Replay animation", exact: true }).waitFor();
    assert.equal(await scene.innerHTML(), original, "enabling reduced motion stops and completes an active animation");
    console.log("reduced motion: static completion on load and on preference change");
  });

  await withPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } }, async (page) => {
    await page.goto(base);
    assert.ok(await page.getByRole("img", { name: "The delete key never makes contact" }).isVisible());
    assert.ok(await page.getByText("Never delete production data.", { exact: true }).isVisible());
    assert.ok(await page.getByText("Delete blocked before execution. Finding reported.", { exact: true }).isVisible());
    await page.locator(".coverage summary").click();
    assert.ok(await page.getByText("TENET_RECORDING=off", { exact: true }).isVisible());
    assert.equal(await page.getByRole("button").count(), 0, "no inert animation controls without JavaScript");
    await page.getByRole("link", { name: "Read the docs", exact: true }).click();
    assert.ok(page.url().endsWith("/docs.html"), "CTA works without JavaScript");
    console.log("no JavaScript: complete illustration, rule, result and working CTA");
  });

  await withPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }, async (page) => {
    await page.goto(base);
    await page.addStyleTag({ content: "body { zoom: 2; }" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "200% enlargement must not cause horizontal scrolling");
    console.log("200% enlargement: homepage reflows without horizontal scrolling");
  });

  for (const width of [320, 1440]) {
    await withPage({ viewport: { width, height: 900 } }, async (page) => {
      await page.goto(`${base}/docs.html`);
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "shared stylesheet must not break docs");
      console.log(`docs ${width}px: no overflow`);
    });
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
