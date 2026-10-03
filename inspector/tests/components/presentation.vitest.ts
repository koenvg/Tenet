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
  await expect.element(screen.getByText('Would block in enforce mode')).toBeVisible();
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
  await expect.element(screen.getByText('Would ask for approval in enforce mode')).toBeVisible();
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


for (const status of ['pending', 'dropped', 'cancelled', 'unavailable', 'incomplete']) test(`${status} assessment does not invent a decision, passing check or confidence`, async () => {
  const view = makeView({ execution: 'executed' });
  view.assessmentStatus = status;
  view.decision = 'unavailable';
  view.categories = status === 'unavailable' ? ['unavailable'] : ['pending'];
  view.rules = view.rules.map(rule => ({ ...rule, result: null, gateIds: null, contribution: 'unavailable' }));
  const screen = await render(DecisionSummary, { view, rule: view.rules[0], inspect: () => {} });
  expect(screen.container.querySelector('.primary-badges .status-chip')?.textContent?.trim()).toBe('Ran');
  expect(screen.container.querySelector('.map-verdict')?.textContent).toBe('Decision unavailable');
  expect(screen.container.querySelector('.assessment-status')?.textContent).toContain(status);
  expect(screen.container.querySelectorAll('[role="meter"]')).toHaveLength(0);
  expect(screen.container.querySelectorAll('.map-check')).not.toHaveLength(0);
  expect(Array.from(screen.container.querySelectorAll('.map-caption h3'), el => el.textContent).join(' ')).not.toMatch(/PASS|ALLOW|BLOCK|SUFFICIENT/);
});

test('suspected violations and uncertainty overlap without hiding severity or actual permission', async () => {
  const view = makeView({ choice: 'FAIL', execution: 'executed' });
  view.rules[0]!.gateIds!.push('rule-fail');
  const screen = await render(DecisionSummary, { view, rule: view.rules[0], inspect: () => {} });
  expect(screen.container.querySelector('.primary-status .status-chip.neutral')?.textContent).toContain('Ran');
  expect(screen.container.querySelector('.finding-chips .danger')?.textContent).toContain('Suspected violation');
  expect(screen.container.querySelector('.finding-chips .caution')?.textContent).toContain('Assessment uncertainty');
  expect(screen.container.querySelectorAll('.map-check.danger')).toHaveLength(1);
  expect(screen.container.querySelectorAll('.map-check.caution')).toHaveLength(1);
  expect(screen.container.querySelector('.map-rule-location')?.textContent).toContain('Severity BLOCK');
  expect(screen.container.querySelector('.map-check-note')?.textContent).toContain('Observe mode did not enforce');
  await screen.unmount();
  view.rules[0]!.enforcement = 'WARN';
  const advisory = await render(DecisionSummary, { view, rule: view.rules[0], inspect: () => {} });
  expect(advisory.container.querySelectorAll('.map-check.danger')).toHaveLength(0);
  expect(advisory.container.querySelector('.finding-chips .danger')?.textContent).toContain('Suspected violation');
  expect(advisory.container.querySelector('.map-rule-location')?.textContent).toContain('Severity WARN');
  expect(advisory.container.querySelector('.map-check-note')?.textContent).toContain('WARN does not block');
});

test('observe ASK is counterfactual, and enforced uncertainty can still be an actual block', async () => {
  const view = makeView({ choice: 'APPROVAL_REQUIRED', decision: 'ASK', execution: 'executed', gate: null });
  const screen = await render(DecisionSummary, { view, rule: view.rules[0], inspect: () => {} });
  expect(screen.container.querySelector('.finding-chips .approval')?.textContent).toContain('Approval condition');
  await expect.element(screen.getByText('Approval was not requested in observe mode.', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('.map-verdict')?.textContent).toBe('Would ask for approval in enforce mode');
  await screen.unmount();
  const enforced = makeView({ mode: 'enforce' });
  const blocked = await render(DecisionSummary, { view: enforced, rule: enforced.rules[0], inspect: () => {} });
  expect(blocked.container.querySelector('.primary-badges .danger')?.textContent).toContain('TENET blocked');
  expect(blocked.container.querySelector('.primary-badges')?.textContent).toContain('Enforce');
  expect(blocked.container.querySelector('.finding-chips .caution')?.textContent).toContain('Assessment uncertainty');
});

test('missing historical mode and permission stay unknown even with approval and ALLOW', async () => {
  const view = makeView({ decision: 'ALLOW', permission: 'unknown', gate: null });
  delete (view.identity as any).mode;
  view.approval = 'approved';
  const screen = await render(DecisionSummary, { view, rule: view.rules[0], inspect: () => {} });
  expect(screen.container.querySelector('.primary-badges')?.textContent).toContain('Execution unknown');
  expect(screen.container.querySelector('.primary-badges')?.textContent).toContain('Mode unknown');
  expect(screen.container.querySelector('.map-verdict')?.textContent).toBe('Allow');
});
