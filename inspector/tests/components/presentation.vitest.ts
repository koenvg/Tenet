import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import SafeMarkdown from "../../src/SafeMarkdown.js";
import DecisionSummary from "../../src/DecisionSummary.js";
import AssessmentMap from "../../src/AssessmentMap.js";
import RuleDetail from "../../src/RuleDetail.js";
import { makeView, recordedQuestion } from './fixtures.js';
import { callConcern } from '../../src/presentation.js';
import '../../src/style.css';
import '../../src/summary.css';

test('one navigation cue keeps violations, overlap, missing results and contradictions distinct', () => {
  expect(callConcern({ execution: 'executed', permission: 'released', categories: ['violation', 'uncertainty'] })?.text).toBe('Suspected violation +1');
  expect(callConcern({ execution: 'executed', permission: 'released', categories: ['uncertainty'] })?.tone).toBe('caution');
  expect(callConcern({ execution: 'unknown', permission: 'released', categories: ['pending'] })?.text).toContain('No recorded result');
  expect(callConcern({ execution: 'executed', permission: 'blocked', categories: ['violation'] })?.text).toBe('Conflicting records · Suspected violation');
  expect(callConcern({ execution: 'failed', permission: 'blocked' })?.text).toBe('Conflicting records');
  expect(callConcern({ execution: 'executed', permission: 'released', categories: [] })).toBeNull();
  expect(callConcern({ categories: [], missing: ['assessment'] })?.text).toBe('Incomplete recording');
});

test('recorded Markdown and hostile HTML remain inert', async () => {
  const screen = await render(createElement(SafeMarkdown, { source: recordedQuestion.instructions }));
  await expect.element(screen.getByRole('heading', { name: 'Recorded instructions' })).toBeVisible();
  expect(screen.container.querySelectorAll('script, img, iframe, a, object')).toHaveLength(0);
  expect((window as Window & { hostile?: boolean }).hostile).toBeUndefined();
  await expect.element(screen.getByText(/hostile.invalid\/probe/)).toBeVisible();
});

test('PASS with low confidence remains distinct from a reported violation and actual execution', async () => {
  const view = makeView({ execution: 'executed' }), inspect = vi.fn();
  const screen = await render(createElement(DecisionSummary, { view }));
  await expect.element(screen.getByText('Would block in enforce mode')).toBeVisible();
  await expect.element(screen.getByText('Ran', { exact: true })).toBeVisible();
  const map = await render(createElement(AssessmentMap, { view, rule: view.rules[0], inspect }));
  await expect.element(map.getByRole('group', { name: 'Decision map' })).toBeVisible();
  await expect.element(map.getByRole('meter', { name: 'Evidence confidence' })).toHaveAttribute('aria-valuetext', '0.85; required confidence 0.9');
  await map.getByRole('button', { name: 'Inspect evidence confidence' }).click();
  expect(inspect).toHaveBeenCalledWith('Evidence confidence');
  expect(map.container.querySelector('.map-check')?.textContent).toContain('PASS');
  const detail = await render(createElement(RuleDetail, { rule: view.rules[0]! }));
  await expect.element(detail.getByText(/not a reported violation/)).toBeVisible();
  expect(detail.container.querySelector('.rule-outcome .status-chip')?.textContent?.trim()).toBe('PASS');
});

test('UNKNOWN, approval and failed assessment never appear as a pass', async () => {
  const unknown = makeView({ choice: 'UNKNOWN', decision: 'ASK' });
  const screen = await render(createElement(DecisionSummary, { view: unknown }));
  await expect.element(screen.getByText('Would ask for approval in enforce mode')).toBeVisible();
  const map = await render(createElement(AssessmentMap, { view: unknown, rule: unknown.rules[0], inspect: () => {} }));
  await expect.element(map.getByText('Unknown does not mean passed.')).toBeVisible();
  await screen.unmount(); await map.unmount();
  const approval = makeView({ choice: 'APPROVAL_REQUIRED', decision: 'ASK' });
  const approvalScreen = await render(createElement(RuleDetail, { rule: approval.rules[0]! }));
  expect(approvalScreen.container.querySelector('.rule-outcome .status-chip.approval')?.textContent).toContain('APPROVAL_REQUIRED');
  await approvalScreen.unmount();
  const failed = makeView({ failure: 'timeout', evidence: false });
  const failureScreen = await render(createElement(DecisionSummary, { view: failed }));
  await expect.element(failureScreen.getByText(/Assessment unavailable\./)).toBeVisible();
  const failureMap = await render(createElement(AssessmentMap, { view: failed, rule: failed.rules[0], inspect: () => {} }));
  expect(failureMap.container.querySelector('.map-check')?.textContent).not.toContain('Rule outcome / PASS');
});

for (const status of ['pending', 'dropped', 'cancelled', 'unavailable', 'incomplete'] as const) test(`${status} assessment does not invent a decision, passing check or confidence`, async () => {
  const view = makeView({ execution: 'executed' });
  view.assessmentStatus = status; view.decision = 'unavailable';
  view.evaluatorState = { status, reason: status === 'unavailable' ? 'assessment-unavailable' : null };
  view.categories = status === 'unavailable' ? ['unavailable'] : ['pending'];
  view.rules = view.rules.map(rule => ({ ...rule, result: null, gateIds: null, contribution: 'unavailable' }));
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('.primary-badges .status-chip')?.textContent?.trim()).toBe('Ran');
  expect(screen.container.querySelector('.story-assessment')?.textContent).toBe('Decision unavailable');
  expect(screen.container.querySelector('.assessment-status')?.textContent).toContain(status);
  const map = await render(createElement(AssessmentMap, { view, rule: view.rules[0], inspect: () => {} }));
  expect(map.container.querySelectorAll('[role="meter"]')).toHaveLength(0);
  expect(map.container.querySelectorAll('.map-check')).not.toHaveLength(0);
  expect(Array.from(map.container.querySelectorAll('.map-caption h3'), el => el.textContent).join(' ')).not.toMatch(/PASS|ALLOW|BLOCK|SUFFICIENT/);
});

test('suspected violations and uncertainty overlap without hiding severity or actual permission', async () => {
  const view = makeView({ choice: 'FAIL', execution: 'executed' });
  view.rules[0]!.gateIds!.push('rule-fail');
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('.primary-status .status-chip.neutral')?.textContent).toContain('Ran');
  expect(screen.container.querySelector('.finding-chips .danger')?.textContent).toContain('Suspected violation');
  expect(screen.container.querySelector('.finding-chips .caution')?.textContent).toContain('Assessment uncertainty');
  const map = await render(createElement(AssessmentMap, { view, rule: view.rules[0], inspect: () => {} }));
  expect(map.container.querySelectorAll('.map-check.danger')).toHaveLength(1);
  expect(map.container.querySelectorAll('.map-check.caution')).toHaveLength(1);
  expect(map.container.querySelector('.map-rule-location')?.textContent).toContain('Severity BLOCK');
  expect(map.container.querySelector('.map-check-note')?.textContent).toContain('Observe mode did not enforce');
  await map.unmount();
  view.rules[0]!.enforcement = 'WARN';
  const advisory = await render(createElement(AssessmentMap, { view, rule: view.rules[0], inspect: () => {} }));
  expect(advisory.container.querySelectorAll('.map-check.danger')).toHaveLength(0);
  expect(screen.container.querySelector('.finding-chips .danger')?.textContent).toContain('Suspected violation');
  expect(advisory.container.querySelector('.map-rule-location')?.textContent).toContain('Severity WARN');
  expect(advisory.container.querySelector('.map-check-note')?.textContent).toContain('WARN does not block');
});

test('observe ASK is counterfactual, and enforced uncertainty can still be an actual block', async () => {
  const view = makeView({ choice: 'APPROVAL_REQUIRED', decision: 'ASK', execution: 'executed', gate: null });
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('.finding-chips .approval')?.textContent).toContain('Approval condition');
  await expect.element(screen.getByText('Approval was not requested in observe mode.', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('.story-assessment')?.textContent).toBe('Would ask for approval in enforce mode');
  await screen.unmount();
  const enforced = makeView({ mode: 'enforce' });
  const blocked = await render(createElement(DecisionSummary, { view: enforced }));
  expect(blocked.container.querySelector('.primary-badges .danger')?.textContent).toContain('TENET blocked');
  expect(blocked.container.querySelector('.primary-badges')?.textContent).toContain('Enforce');
  expect(blocked.container.querySelector('.finding-chips .caution')?.textContent).toContain('Assessment uncertainty');
});

test('missing historical mode and permission stay unknown even with approval and ALLOW', async () => {
  const view = makeView({ decision: 'ALLOW', permission: 'unknown', gate: null });
  delete (view.identity as any).mode; view.approval = 'approved';
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('.primary-badges')?.textContent).toContain('Execution unknown');
  expect(screen.container.querySelector('.primary-badges')?.textContent).toContain('Mode unknown');
  expect(screen.container.querySelector('.story-assessment')?.textContent).toBe('Allow');
});
