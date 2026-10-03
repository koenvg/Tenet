import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Detail from '../../src/Detail.svelte';
import PaneResizer from '../../src/PaneResizer.svelte';
import { makeView, recordedQuestion } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

test('the first view tells the call story and keeps diagnostics behind three disclosures', async () => {
  const screen = await render(Detail, { view: makeView({ execution: 'executed' }) });
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  await expect.element(screen.getByText('git status --short', { exact: true }).first()).toBeVisible();
  expect(screen.container.querySelector('.primary-badges')?.textContent).toContain('Ran');
  expect(screen.container.querySelector('.primary-badges')?.textContent).toContain('Observe');
  await expect.element(screen.getByText('Would block in enforce mode', { exact: true }).first()).toBeVisible();
  expect(screen.container.querySelector('.decision-map')?.checkVisibility()).toBe(false);
  expect(screen.container.querySelector('.evidence-dock')?.checkVisibility()).toBe(false);
  expect(screen.container.querySelector('.lifecycle')?.checkVisibility()).toBe(false);
  const entries = [...screen.container.querySelectorAll('.summary-content > details > summary')].map(el => el.textContent?.trim());
  expect(entries).toEqual(['Why this assessment', 'Evidence', 'Details']);
  await screen.getByText('Why this assessment', { exact: true }).click();
  await expect.element(screen.getByRole('group', { name: 'Decision map' })).toBeVisible();
  await screen.getByText('Evidence', { exact: true }).first().click();
  await expect.element(screen.getByRole('heading', { name: 'Evidence dock' })).toBeVisible();
  await screen.getByText('Details', { exact: true }).click();
  await expect.element(screen.getByText('Recording schemas', { exact: true })).toBeVisible();
});

test('expanded Details groups exact facts and bounds long identifiers at desktop and narrow widths', async () => {
  for (const width of [1280, 390]) {
    await page.viewport(width, 1000);
    const view = makeView({ execution: 'unknown', permission: 'blocked' });
    const id = 'recorded-identifier-'.repeat(160);
    view.identity!.invocationId = id;
    const screen = await render(Detail, { view });
    await screen.getByText('Details', { exact: true }).click();
    expect([...screen.container.querySelectorAll('.capture-details .record-group > h3')].map(el => el.textContent)).toEqual(['Recorded outcomes', 'Recording', 'Coverage and limits']);
    const facts = screen.container.querySelector('.capture-details .lifecycle')!;
    expect(facts.textContent).toContain('blocked');
    expect(facts.textContent).toContain('unknown');
    expect(getComputedStyle(facts).display).toBe('grid');
    await screen.getByText('Record identifiers', { exact: true }).click();
    const value = screen.container.querySelector<HTMLTextAreaElement>('.record-identifiers .record-id')!;
    expect(value.value).toBe(id);
    expect(value.clientHeight).toBeLessThanOrEqual(100);
    expect(value.scrollHeight).toBeGreaterThan(value.clientHeight);
    expect(screen.container.querySelector('.capture-details')!.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    await screen.getByText('Interpretation limits', { exact: true }).click();
    await expect.element(screen.getByText(/does not certify that every host path was prevented/)).toBeVisible();
    await screen.unmount();
  }
  await page.viewport(1280, 720);
});

test('precision rejection is readable at desktop and mobile widths without implying a violation', async () => {
  for (const width of [1280, 390]) {
    await page.viewport(width, 844);
    const view = makeView({ failure: 'invalid-response', gate: null });
    view.validationIssue = 'unit-sum';
    const screen = await render(Detail, { view });
    await screen.getByText('Details', { exact: true }).click();
    const notice = screen.getByText(/unit-sum: Evaluator probabilities/);
    await expect.element(notice).toBeVisible();
    const message = screen.container.textContent!;
    expect(message).toContain('Precision accommodation is unsupported');
    expect(message).toContain('not a semantic violation');
    const box = screen.container.querySelectorAll('.assessment-status');
    for (const el of box) expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    await screen.unmount();
  }
  await page.viewport(1280, 720);
});

test('questions toggle between safe Rich text and exact recorded JSON', async () => {
  const screen = await render(Detail, { view: makeView() });
  await screen.getByText('Evidence', { exact: true }).first().click();
  await screen.getByRole('tab', { name: 'Questions' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Recorded instructions' }).first()).toBeVisible();
  expect(screen.container.querySelectorAll('.question-rich script, .question-rich img, .question-rich a')).toHaveLength(0);
  await screen.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect.element(screen.getByText(/"historical-test-v1"/).first()).toBeVisible();
  expect(JSON.parse(screen.container.querySelector('.question-json')!.textContent!)).toEqual(recordedQuestion);
  await screen.getByRole('button', { name: 'Rich', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Recorded instructions' }).first()).toBeVisible();
});

test('rule selection and keyboard tabs preserve shared evidence scroll and focus', async () => {
  const screen = await render(Detail, { view: makeView() });
  await screen.getByText('Evidence', { exact: true }).first().click();
  await expect.element(screen.getByRole('heading', { name: 'Evidence dock' })).toBeVisible();
  expect(document.activeElement?.id).toBe('dock-heading');
  const panel = screen.container.querySelector<HTMLElement>('#panel-Evidence')!;
  panel.style.height = '80px'; panel.scrollTop = 37;
  expect(panel.scrollTop).toBeGreaterThan(0);
  await screen.getByText('Why this assessment', { exact: true }).click();
  await screen.getByText(/Browse all rules/).click();
  await screen.getByRole('button', { name: /Record every file edit/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Rule at line 9' })).toBeVisible();
  expect(screen.container.querySelector('#panel-Evidence')).toBe(panel);
  expect(panel.scrollTop).toBe(37);
  await screen.getByRole('tab', { name: 'Questions' }).click();
  await expect.element(screen.getByText('second_outcome')).toBeVisible();
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(screen.getByRole('tab', { name: 'Response' })).toHaveAttribute('aria-selected', 'true');
  await screen.getByRole('tab', { name: 'Evidence' }).click();
  expect(panel.scrollTop).toBe(37);
});

test('resizer clamps pointer and keyboard updates at desktop and mobile widths', async () => {
  for (const width of [1280, 390]) {
    await page.viewport(width, 844);
    const screen = await render(PaneResizer, { value: 300, min: 220, max: 460, label: 'Resize call explorer', controls: 'call-explorer' });
    const separator = screen.container.querySelector<HTMLElement>('[role="separator"]')!;
    separator.style.width = '10px'; separator.style.height = '100px';
    separator.focus();
    await userEvent.keyboard('{End}');
    expect(separator.getAttribute('aria-valuenow')).toBe('460');
    await userEvent.keyboard('{ArrowRight}');
    expect(separator.getAttribute('aria-valuenow')).toBe('460');
    await userEvent.keyboard('{Home}');
    expect(separator.getAttribute('aria-valuenow')).toBe('220');
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(separator.getAttribute('aria-valuenow')).toBe('270');
    const target = document.createElement('div');
    target.style.cssText = `position: fixed; left: ${width - 40}px; top: 80px; width: 20px; height: 20px`;
    document.body.append(target);
    await userEvent.dragAndDrop(separator, target);
    expect(separator.getAttribute('aria-valuenow')).toBe('460');
    target.remove();
    await screen.unmount();
  }
  await page.viewport(1280, 720);
});

test('applicability displays absent evidence without inventing a confidence score', async () => {
  const view = makeView();
  view.assessmentProfile = 'applicability-v1';
  view.decision = 'ALLOW';
  const rule = view.rules[0]!;
  rule.result = { outcome: { choice: 'NOT_APPLICABLE', probabilities: { NOT_APPLICABLE: 0.95, PASS: 0.05 } }, evidence: null };
  rule.gateIds = [];
  rule.evidenceGate = 'not-applicable';
  rule.contribution = 'pass';
  rule.thresholds.evidenceThreshold = null;
  view.rules = [rule];
  const screen = await render(Detail, { view });
  await screen.getByText('Why this assessment', { exact: true }).click();
  await screen.getByText('Selected check details', { exact: true }).click();
  await expect.element(screen.getByText('Evidence-confidence gate does not apply. No evidence score was recorded.')).toBeVisible();
  await screen.getByText('Probabilities and rule details', { exact: true }).click();
  await expect.element(screen.getByText('Not applicable. No evidence score.', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('Evidence-confidence gate does not apply. No evidence score.', { exact: true })).toBeVisible();
  expect(screen.container.querySelectorAll('.confidence-meter')).toHaveLength(0);
});
