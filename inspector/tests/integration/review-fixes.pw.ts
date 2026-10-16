import { expect, test } from '../playwright-fixture.js';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionKey } from '../../../src/recording/archive.js';
import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { ruleRecording, writeRuleRecording } from '../../../test/session-rules-fixture.js';
const session = sessionKey('review');
async function seed(directory: string) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  writeRuleRecording(writer, 'review', 'A', ruleRecording()); await writer.complete();
}
test('dismiss then withdraw A and append validated violation B advances the visible headline without rereading A', async ({ withInspector }) => {
  await withInspector('review-retired-record', async ({ page, directory }) => {
    const reads: string[] = []; page.on('request', request => { if (request.url().includes('/invocations/')) reads.push(request.url()); });
    await page.getByRole('button', { name: /Only synthetic actions/ }).click();
    await page.locator('.rule-action-disclosure > summary').click(); await page.locator('.decision-summary').waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await rm(join(directory, session), { recursive: true });
    const writer = new FixtureArchiveWriter({ enabled: true, directory });
    writeRuleRecording(writer, 'review', 'B', ruleRecording({ outcome: 'FAIL' })); await writer.complete();
    await page.waitForResponse(response => response.url().includes('/rules?'));
    await expect.poll(() => page.locator('.rule-session-outcome').textContent()).toContain('Violation found');
    await page.waitForResponse(response => response.url().includes('/api/sessions?'));
    expect(reads).toHaveLength(1); expect(await page.locator('dialog[open]').count()).toBe(0);
  }, { base: false, seed, path: `/?session=${session}` });
});
test('first exact response after a source advance publishes matching violation metadata and check wording', async ({ withInspector }) => {
  await withInspector('review-first-exact-revision', async ({ page, directory }) => {
    await page.getByRole('button', { name: /Only synthetic actions/ }).click(); await page.locator('.rule-check').waitFor();
    expect(await page.locator('.rule-check > .rule-status').textContent()).toBe('No violations found');
    let advanced = false;
    await page.route('**/invocations/*', async route => {
      if (!advanced) {
        advanced = true;
        const folder = join(directory, session);
        for (const name of await readdir(folder)) {
          const file = join(folder, name), record = JSON.parse(await readFile(file, 'utf8'));
          if (record.stage !== 'assessment') continue;
          record.data.assessment.rules[0].outcome = { choice: 'FAIL', probabilities: { PASS: 0, FAIL: 1, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } };
          await writeFile(file, JSON.stringify(record), { mode: 0o600 });
        }
      }
      await route.continue();
    });
    await page.locator('.rule-action-disclosure > summary').click(); await page.locator('.decision-summary').waitFor();
    expect(await page.locator('.rule-panel-body > .rule-status').textContent()).toBe('Violation found');
    expect(await page.locator('.rule-check > .rule-status').textContent()).toBe('Violation found');
    expect(await page.locator('.rule-full-text').textContent()).toBe('Only synthetic actions. <script>inert()</script>');
    expect(await page.locator('.rule-session-outcome').textContent()).toContain('Violation found');
  }, { base: false, seed, path: `/?session=${session}` });
});


test('two open action disclosures preserve mounted views and closing one releases its exact data', async ({ withInspector }) => {
  await withInspector('review-multiple-open', async ({ page }) => {
    await page.getByRole('button', { name: /Only synthetic actions/ }).click();
    const disclosures = page.locator('.rule-action-disclosure');
    await disclosures.nth(0).locator('summary').click(); await disclosures.nth(0).locator('.decision-summary').waitFor();
    await disclosures.nth(0).locator('.invocation').evaluate(el => { el.setAttribute('data-retained', 'A'); });
    await disclosures.nth(1).locator('summary').click(); await disclosures.nth(1).locator('.decision-summary').waitFor();
    expect(await page.locator('.rule-action-disclosure[open]').count()).toBe(2);
    expect(await disclosures.nth(0).locator('.invocation').getAttribute('data-retained')).toBe('A');
    const url = page.url();
    await disclosures.nth(0).locator(':scope > summary').click();
    await expect.poll(() => disclosures.nth(0).locator('.invocation').count()).toBe(0);
    expect(await disclosures.nth(1).locator('.invocation').count()).toBe(1); expect(page.url()).toBe(url);
    await page.waitForResponse(response => response.url().includes('/rules?'));
    expect(await page.locator('.rule-action-disclosure[open]').count()).toBe(1);
  }, { base: false, path: `/?session=${session}`, seed: async directory => {
    await seed(directory); const writer = new FixtureArchiveWriter({ enabled: true, directory });
    writeRuleRecording(writer, 'review', 'B', ruleRecording()); await writer.complete();
  } });
});
