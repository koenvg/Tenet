import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { createElement } from 'react';
import { page } from 'vitest/browser';
import SummaryWorkspace from '../../src/shared/SummaryWorkspace.js';
import { standaloneSummary } from '../../src/shared/standalone-adapter.js';
import { makeView } from './fixtures.js';

test('safe summary shows recorded facts and inert rule text without standalone payloads', async () => {
  await page.viewport(1280, 900);
  const view = makeView({ execution: 'executed' });
  view.rules[0]!.text = '<script>window.summaryProbe = true</script>';
  view.response = { value: { message: 'provider-response-sentinel' } };
  view.evidence = { ...view.evidence, unrelated: 'submitted-evidence-sentinel' };
  view.identity!.cwd = '/raw-path-sentinel';
  view.policy = { privateSource: 'raw-policy-sentinel' };
  view.rules[0]!.questions = { outcome: 'exact-question-sentinel', evidence: 'exact-question-sentinel' };
  view.rules[0]!.mapping = { reference: 'raw-mapping-sentinel' };
  view.rules[0]!.result!.privateSource = 'raw-result-sentinel';
  const model = standaloneSummary(view);
  const serialized = JSON.stringify(model);
  for (const raw of ['git status --short', 'Recorded instructions', 'window.hostile', 'first_outcome', 'payload', 'questions', 'response', 'mapping', 'provider-response-sentinel', 'submitted-evidence-sentinel', 'raw-path-sentinel', 'raw-policy-sentinel', 'exact-question-sentinel', 'raw-mapping-sentinel', 'raw-result-sentinel']) {
    expect(serialized).not.toContain(raw);
  }
  const screen = await render(createElement(SummaryWorkspace, { model: { calls: [], selected: model, coverage: 'Best-effort synthetic capture.', loading: false, error: '', category: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
  await screen.getByText('Why this assessment', { exact: true }).click();
  await screen.getByText('Selected check details', { exact: true }).click();
  await expect.element(screen.getByText('<script>window.summaryProbe = true</script>').first()).toBeVisible();
  expect(screen.container.querySelector('script')).toBeNull();
  for (const raw of ['git status --short', 'provider-response-sentinel', 'submitted-evidence-sentinel', 'raw-path-sentinel', 'raw-policy-sentinel', 'exact-question-sentinel', 'raw-mapping-sentinel', 'raw-result-sentinel']) expect(screen.container.textContent).not.toContain(raw);
  expect(Object.hasOwn(window, 'summaryProbe')).toBe(false);
  expect(screen.container.textContent).toContain('standalone inspector');
});

for (const [viewport, container] of [[390, 390], [1280, 390], [1280, 1000]]) {
  test(`workspace navigation follows ${container}px container in ${viewport}px window`, async () => {
    await page.viewport(viewport!, 844);
    const view = makeView({ execution: 'executed' });
    const screen = await render(createElement(SummaryWorkspace, { model: { calls: [], selected: standaloneSummary(view), category: '', coverage: 'Synthetic coverage stays visible.', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
    screen.container.style.width = `${container}px`;
    screen.container.style.maxWidth = '100%';
    if (container! < 650) {
      const navigation = screen.getByRole('navigation', { name: 'Workspace views' });
      await expect.element(navigation).toBeVisible();
      await navigation.getByRole('button', { name: 'Summary' }).click();
      await expect.element(screen.getByRole('region', { name: 'Actual execution' })).toBeVisible();
      await expect.element(screen.getByText('Synthetic coverage stays visible.')).toBeVisible();
      await expect.element(screen.getByRole('button', { name: 'Refresh archive' })).toBeVisible();
      await screen.getByText('Why this assessment', { exact: true }).click();
      await screen.getByRole('button', { name: 'Inspect evidence confidence' }).click();
      await expect.element(screen.getByRole('heading', { name: 'Evidence confidence' })).toBeVisible();
      await screen.getByText(/Browse all rules/).click();
      await screen.getByRole('button', { name: /Record every file edit/ }).click();
      await expect.element(screen.getByRole('heading', { name: 'Rule at line 9' })).toBeVisible();
      await navigation.getByRole('button', { name: 'Calls' }).click();
      await expect.element(screen.getByRole('complementary', { name: 'Call explorer' })).toBeVisible();
    } else {
      await expect.element(screen.getByRole('region', { name: 'Actual execution' })).toBeVisible();
      await expect.element(screen.getByRole('complementary', { name: 'Call explorer' })).toBeVisible();
    }
    const workspace = screen.container.querySelector<HTMLElement>('.tenet-summary-workspace')!;
    expect(workspace.scrollWidth).toBeLessThanOrEqual(workspace.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });
}
test('shared workspace keeps the standalone summary hierarchy and check disclosures', async () => {
  await page.viewport(1280, 900);
  const screen = await render(createElement(SummaryWorkspace, { model: { calls: [], selected: standaloneSummary(makeView()), category: '', coverage: 'Synthetic', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('[aria-label="Decision map"]')?.checkVisibility()).toBe(false);
  await screen.getByText('Why this assessment', { exact: true }).click();
  await expect.element(screen.getByRole('group', { name: 'Decision map' })).toBeVisible();
  await screen.getByRole('button', { name: 'Inspect evidence confidence' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Evidence confidence' })).toBeVisible();
  expect(document.activeElement?.textContent).toContain('Evidence confidence');
  await screen.getByText(/Browse all rules/).click();
  await screen.getByRole('button', { name: /Record every file edit/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Rule at line 9' })).toBeVisible();
  expect(screen.container.querySelectorAll('.common-summary > details > summary')).toHaveLength(1);
  expect(screen.container.querySelector('.evidence-dock')).toBeNull();
});


for (const [name, options, text] of [
  ['pass', { decision: 'ALLOW', gate: null }, 'No blocking issues or approval requirements were recorded.'],
  ['selected FAIL', { choice: 'FAIL', gate: 'rule-fail' }, 'A policy rule was reported as violated.'],
  ['uncertain PASS', {}, 'Evidence confidence was below the required threshold.'],
  ['approval', { choice: 'APPROVAL_REQUIRED', decision: 'ASK', gate: null }, 'An approval condition was recorded.'],
  ['provider failure', { failure: 'provider-error' }, 'Assessment unavailable. No completed assessment is available.'],
] as const) test(`shared summary preserves ${name} meaning`, async () => {
  await page.viewport(1280, 900);
  const summary = standaloneSummary(makeView(options));
  const screen = await render(createElement(SummaryWorkspace, { model: { calls: [], selected: summary, category: '', coverage: 'Synthetic', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await expect.element(screen.getByText(text)).toBeVisible();
  if (name === 'provider failure') await expect.element(screen.getByText('Recorded assessment: unavailable · provider-error.')).toBeVisible();
});

test('historical thresholds and built-in identity are recorded inputs, not current policy', async () => {
  await page.viewport(1280, 900);
  const view = makeView();
  view.rules[0]!.thresholds.evidenceThreshold = .91;
  view.rules[0]!.builtin = true;
  const screen = await render(createElement(SummaryWorkspace, { model: { calls: [], selected: standaloneSummary(view), category: '', coverage: 'Synthetic', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await screen.getByText('Why this assessment', { exact: true }).click();
  await screen.getByText('Selected check details', { exact: true }).click();
  await expect.element(screen.getByText('Built-in integrity').first()).toBeVisible();
  expect(screen.container.querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe('0.85; required confidence 0.91');
});

test('supplied recorded evaluator failure stays distinct from execution and a legacy status', async () => {
  await page.viewport(1280, 900);
  const summary = standaloneSummary({ ...makeView({ execution: 'executed', decision: 'ALLOW', gate: null }),
    evaluatorState: { status: 'unavailable', reason: 'provider-error' } });
  const screen = await render(createElement(SummaryWorkspace, { model: { calls: [], selected: summary, category: '', coverage: 'Synthetic', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await expect.element(screen.getByText('Recorded assessment: unavailable · provider-error.')).toBeVisible();
  await expect.element(screen.getByText('Assessment unavailable. No completed assessment is available.')).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
});
