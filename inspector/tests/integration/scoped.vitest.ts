import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { recordSessionKey, recordInvocationKey } from '../../../src/recording/archive.js';
import { recordScopedFixture, scopedIdentity } from '../../../test/scoped-recording-fixture.js';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';
import { openRecordedData, reveal } from '../ui-navigation.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);
const address = { ...scopedIdentity, schemaVersion: 5 };
const link = `/?session=${recordSessionKey(address)}&invocation=${recordInvocationKey(address)}`;

for (const width of [1280, 390]) test(`offline scoped inspector preview at ${width}px preserves separate inputs and recorded versions`, async () => {
  await withInspector(`scoped-${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.decision-summary').waitFor();
    await reveal(page, '.recorded-disclosure');
    await reveal(page, '.recording-details');
    const details = page.locator('.recording-details');
    expect(await details.innerText()).toContain('apus-recording-v2');
    expect(await details.innerText()).toContain('policy-rules-v9-scoped');
    expect(await details.innerText()).toContain('scripted-scoped');
    expect(await details.innerText()).toContain('scoped submissions attempted; processing is not inferred');
    await openRecordedData(page);
    const panel = page.getByRole('region', { name: 'Submitted evidence', exact: true });
    expect(await panel.innerText()).toContain('Recorded input scopes');
    expect(await panel.innerText()).not.toContain('Shared by all rules.');
    expect(await panel.locator('.evidence-section').count()).toBe(3);
    const ordinary = panel.locator('.evidence-section').first();
    expect(await ordinary.innerText()).toContain('ordinary:0');
    expect(await ordinary.innerText()).toContain('thinkingTrace');
    expect(await ordinary.innerText()).not.toContain('/synthetic/TENET.md');
    expect(await ordinary.innerText()).not.toContain('resolvedAction');
    expect(await page.locator('[data-fact="result"]').innerText()).toBe('Unknown / not recorded');
    expect(await page.getByRole('region', { name: 'Recorded call facts', exact: true }).getByLabel('Recorded action').innerText()).toBe('/synthetic/README.md');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('coverage/inspector-artifacts/scoped-preview', { recursive: true });
    await ordinary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `coverage/inspector-artifacts/scoped-preview/ordinary-${width}.png` });
    await panel.locator('.evidence-section').nth(2).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `coverage/inspector-artifacts/scoped-preview/protection-${width}.png` });
    await writeFile(`coverage/inspector-artifacts/scoped-preview/page-${width}.html`, await page.content());
  }, { base: false, seed: directory => recordScopedFixture(directory), path: link });
});
