import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SafeMarkdown from '../../src/SafeMarkdown.svelte';
import DecisionSummary from '../../src/DecisionSummary.svelte';
import RuleDetail from '../../src/RuleDetail.svelte';
import { makeView, recordedQuestion } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

test('recorded Markdown and hostile HTML remain inert', async () => {
  const screen = await render(SafeMarkdown, { source: recordedQuestion.instructions });
  await expect.element(screen.getByRole('heading', { name: 'Recorded instructions' })).toBeVisible();
  expect(screen.container.querySelectorAll('script, img, iframe, a, object')).toHaveLength(0);
  expect((window as Window & { hostile?: boolean }).hostile).toBeUndefined();
  await expect.element(screen.getByText(/hostile.invalid\/probe/)).toBeVisible();
});

test('PASS with low confidence remains distinct from a reported violation and actual execution', async () => {
  const view = makeView({ execution: 'executed' }), inspect = vi.fn();
  const screen = await render(DecisionSummary, { view, rule: view.rules[0], inspect });
  await expect.element(screen.getByRole('group', { name: 'Decision map' })).toBeVisible();
  await expect.element(screen.getByText('Would block')).toBeVisible();
  await expect.element(screen.getByText('Actual execution / Ran')).toBeVisible();
  await expect.element(screen.getByRole('meter', { name: 'Evidence confidence' })).toHaveAttribute('aria-valuetext', '0.85; required confidence 0.9');
  await screen.getByRole('button', { name: 'Inspect evidence confidence' }).click();
  expect(inspect).toHaveBeenCalledWith('Evidence confidence');
  expect(document.querySelector('.map-check')?.textContent).toContain('PASS');
  const detail = await render(RuleDetail, { rule: view.rules[0]! });
  await expect.element(detail.getByText(/not a reported violation/)).toBeVisible();
  expect(document.querySelector('.rule-outcome .status-chip')?.textContent?.trim()).toBe('PASS');
});

test('UNKNOWN, approval and failed assessment never appear as a pass', async () => {
  const unknown = makeView({ choice: 'UNKNOWN', decision: 'ASK' });
  const screen = await render(DecisionSummary, { view: unknown, rule: unknown.rules[0], inspect: () => {} });
  await expect.element(screen.getByText('Unknown does not mean passed.')).toBeVisible();
  await expect.element(screen.getByText('Would ask for approval')).toBeVisible();
  await screen.unmount();
  const approval = makeView({ choice: 'APPROVAL_REQUIRED', decision: 'ASK' });
  const approvalScreen = await render(RuleDetail, { rule: approval.rules[0]! });
  expect(approvalScreen.container.querySelector('.rule-outcome .status-chip.approval')?.textContent).toContain('APPROVAL_REQUIRED');
  await approvalScreen.unmount();
  const failed = makeView({ failure: 'timeout', evidence: false });
  const failureScreen = await render(DecisionSummary, { view: failed, rule: failed.rules[0], inspect: () => {} });
  await expect.element(failureScreen.getByText(/Assessment failed: timeout/)).toBeVisible();
  expect(document.querySelector('.map-check')?.textContent).not.toContain('Rule outcome / PASS');
});
