import { expect, test } from '../playwright-fixture.js';
import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { ruleRecording, writeRuleRecording, distribution } from '../../../test/session-rules-fixture.js';
import { sessionKey } from '../../../src/recording/archive.js';

const wording = 'Do not directly use write/edit tools. Delegate those actions.';
const sessions = ['fixed-violation', 'fixed-clear', 'fixed-unclear', 'fixed-unchecked'];
async function seed(directory: string) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  for (const [index, session] of sessions.entries()) {
    for (let n = 0; n < (index === 0 ? 55 : 1); n++) {
      const data = ruleRecording({ outcome: index === 0 || index === 2 ? 'FAIL' : 'PASS' });
      data.begin.policy.rules[0].text = wording;
      if (index === 2) data.assessment.assessment.rules[0].evidence = distribution('INSUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']);
      if (index === 3) { delete data.validation; delete data.assessment; delete data.decision; }
      writeRuleRecording(writer, session, `fixed-call-${n}`, data);
      await writer.settle();
    }
  }
  await writer.complete();
}

for (const width of [1280, 390, 320]) test(`fixed rule native evidence, pagination, keyboard and unchanged focus at ${width}px`, async ({ withInspector }) => {
  await withInspector('fixed-rule', async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const reads: string[] = []; page.on('request', request => { if (request.url().includes('/invocations/')) reads.push(request.url()); });
    const row = page.locator('.fixed-rule-row > summary');
    await expect(row).toContainText(wording);
    await expect(row).toContainText('Violation found in recorded check');
    expect(await page.locator('.rule-list-section').count()).toBe(0);
    expect(await page.locator('.rule-session-outcome').count()).toBe(0);
    expect(reads).toEqual([]);
    await row.focus();
    const summaryParts = row.locator(':scope > *');
    const closedSummaryLayout = await summaryParts.evaluateAll(elements => elements.map(el => {
      const box = el.getBoundingClientRect(), summary = el.parentElement!.getBoundingClientRect();
      return { x: box.x - summary.x, y: box.y - summary.y, width: box.width, height: box.height };
    }));
    await page.keyboard.press('Enter');
    await expect(page.locator('.fixed-check')).toHaveCount(50);
    const openSummaryLayout = await summaryParts.evaluateAll(elements => elements.map(el => {
      const box = el.getBoundingClientRect(), summary = el.parentElement!.getBoundingClientRect();
      return { x: box.x - summary.x, y: box.y - summary.y, width: box.width, height: box.height };
    }));
    expect.soft(openSummaryLayout, 'Opening Evidence preserves rule text, finding and trigger bounds').toEqual(closedSummaryLayout);
    await page.getByRole('button', { name: 'More recorded checks' }).click();
    await expect(page.locator('.fixed-check')).toHaveCount(55);
    const fields = page.locator('.fixed-fields > summary').first();
    await fields.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.fixed-fields[open] dd').first()).toHaveText('edit');
    await expect(fields).toHaveText('Recorded tool fields');
    await expect(fields.locator('svg')).toBeVisible();
    expect.soft(await fields.evaluate(el => {
      const marker = getComputedStyle(el, '::before');
      return marker.display !== 'none' && !['none', 'normal'].includes(marker.content);
    }), 'Recorded tool fields uses its chevron without an extra open marker').toBe(false);
    await expect(page.locator('.fixed-fields[open]')).toContainText('Missing recorded stages: request, response, permission, execution.');
    expect(reads).toHaveLength(1);
    await fields.evaluate(el => { el.dataset.retained = 'yes'; }); await fields.focus();
    await page.waitForResponse(response => response.url().includes('/api/sessions?'));
    expect(await fields.getAttribute('data-retained')).toBe('yes');
    expect(await fields.evaluate(el => document.activeElement === el)).toBe(true);
    expect(await page.locator('.fixed-fields[open]').count()).toBe(1);
    expect(reads).toHaveLength(1);
    expect(await page.locator('.fixed-evidence-trigger svg').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Back to all rules' }).click();
    await expect(page.getByRole('heading', { name: 'Did this session follow the rules?' })).toBeVisible();
    await page.getByRole('button', { name: "Review this session's delegation rule" }).click();
    await expect(page.locator('.fixed-rule-row > summary')).toContainText(wording);
    await page.getByRole('button', { name: 'Operations', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Operations', exact: true })).toBeVisible();
  }, { base: false, seed, path: `/?view=fixed-rule&session=${sessionKey(sessions[0]!)}` });
});

test('fixed picker preserves all four recorded states with no success ticks and insufficient FAIL stays unclear', async ({ withInspector }) => {
  await withInspector('fixed-picker', async ({ page }) => {
    await expect(page.getByText('Choose a Pi session to review this rule.', { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('session')).toBe(false);
    const labels = ['Violation found in recorded check', 'No violations found in recorded checks', 'Unclear', 'Not checked'];
    for (const [index, session] of sessions.entries()) {
      await page.locator('.rule-session-toggle').click();
      expect(await page.locator('#rule-session-menu .rule-status').count()).toBe(0);
      await page.locator(`input[value="${sessionKey(session)}"]`).click();
      await expect(page.locator('.fixed-rule-row > summary .fixed-finding')).toHaveText(labels[index]!);
      expect(await page.locator('.rule-session-toggle .rule-status').count()).toBe(0);
      expect(new URL(page.url()).searchParams.get('session')).toBe(sessionKey(session));
      if (index === 2) {
        await page.locator('.fixed-rule-row > summary').click();
        await expect(page.locator('.fixed-check')).toContainText('FAIL');
        await expect(page.locator('.fixed-check .fixed-finding')).toHaveText('Unclear');
      }
    }
  }, { base: false, seed, path: '/?view=fixed-rule' });
});

test('fixed selection history returns to a bare view without adopting the newest session', async ({ withInspector }) => {
  await withInspector('fixed-history', async ({ page }) => {
    await expect(page.getByText('Choose a Pi session to review this rule.', { exact: true })).toBeVisible();
    await page.locator('.rule-session-toggle').click();
    await page.locator(`input[value="${sessionKey(sessions[0]!)}"]`).click();
    await expect(page.locator('.fixed-rule-row > summary')).toContainText(wording);
    await page.getByRole('button', { name: 'Back to all rules' }).click();
    await expect(page.getByRole('heading', { name: 'Did this session follow the rules?' })).toBeVisible();
    await page.goBack();
    await expect(page.locator('.fixed-rule-row > summary')).toContainText(wording);
    await page.goBack();
    await expect(page.getByText('Choose a Pi session to review this rule.', { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('session')).toBe(false);
    await page.goForward();
    await expect(page.locator('.fixed-rule-row > summary')).toContainText(wording);
    expect(new URL(page.url()).searchParams.get('session')).toBe(sessionKey(sessions[0]!));
  }, { base: false, seed, path: '/?view=fixed-rule' });
});
