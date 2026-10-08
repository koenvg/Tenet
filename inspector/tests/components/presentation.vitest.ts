import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import DecisionSummary from '../../src/CallSummary.js';
import RecordedData from '../../src/RecordedData.js';
import { makeView, recordedQuestion } from './fixtures.js';
import { callConcern } from '../../src/standalone-presentation.js';
import '../../src/style.css';
import '../../src/summary.css';

test('one navigation cue keeps violations, overlap, missing results and contradictions distinct', () => {
  expect(callConcern({ execution: 'executed', permission: 'released', categories: ['violation', 'uncertainty'] })?.text).toBe('Suspected violation +1');
  expect(callConcern({ execution: 'executed', permission: 'released', categories: ['uncertainty'] })?.tone).toBe('caution');
  expect(callConcern({ execution: 'unknown', permission: 'released', categories: ['pending'] })?.text).toContain('Observation pending or incomplete');
  expect(callConcern({ execution: 'executed', permission: 'blocked', categories: ['violation'] })?.text).toBe('Conflicting records · Suspected violation');
  expect(callConcern({ execution: 'failed', permission: 'blocked' })?.text).toBe('Conflicting records');
  expect(callConcern({ execution: 'executed', permission: 'released', categories: [] })).toBeNull();
  expect(callConcern({ categories: [], missing: ['assessment'] })?.text).toBe('Incomplete recording');
});

test('recorded Markdown, hostile HTML, links and images remain inert exact question data', async () => {
  const view = makeView();
  const screen = await render(createElement(RecordedData, { view }));
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  const data = JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!);
  expect(data.rules[0].questions.outcome.instructions).toBe(recordedQuestion.instructions);
  expect(screen.container.querySelectorAll('script, img, iframe, a, object')).toHaveLength(0);
  expect((window as Window & { hostile?: boolean }).hostile).toBeUndefined();
  expect(screen.container.querySelector('.exact-rule-data')!.textContent).toContain('hostile.invalid/probe');
});

test('PASS with low confidence remains distinct from a reported violation and actual execution', async () => {
  const view = makeView({ execution: 'executed' });
  const screen = await render(createElement(DecisionSummary, { view }));
  await expect.element(screen.getByText('Would block in enforce mode')).toBeVisible();
  await expect.element(screen.getByText('Successful', { exact: true })).toBeVisible();
  const detail = await render(createElement(RecordedData, { view }));
  const captured = JSON.parse(detail.container.querySelector('.exact-rule-data pre')!.textContent!);
  expect(captured.rules[0].result.outcome.choice).toBe('PASS');
  expect(captured.rules[0].result.evidence.probabilities.SUFFICIENT).toBe(.85);
  expect(captured.rules[0].thresholds.evidenceThreshold).toBe(.9);
  expect(captured.rules[0].gateIds).toContain('evidence-confidence-below-threshold');
});

test('UNKNOWN, approval and failed assessments keep recorded choices and never invent a pass', async () => {
  for (const choice of ['UNKNOWN', 'APPROVAL_REQUIRED']) {
    const view = makeView({ choice, decision: 'ASK' });
    const summary = await render(createElement(DecisionSummary, { view }));
    await expect.element(summary.getByText('Would ask for approval in enforce mode')).toBeVisible();
    const screen = await render(createElement(RecordedData, { view }));
    const captured = JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!);
    expect(captured.rules[0].result.outcome.choice).toBe(choice);
    expect(captured.rules).toEqual(view.rules);
    await summary.unmount(); await screen.unmount();
  }
  const failed = makeView({ failure: 'timeout', evidence: false });
  const summary = await render(createElement(DecisionSummary, { view: failed }));
  await expect.element(summary.getByText('Unavailable', { exact: true })).toBeVisible();
  const screen = await render(createElement(RecordedData, { view: failed }));
  expect(JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!).rules[0].result).toBeNull();
});

for (const status of ['pending', 'dropped', 'cancelled', 'unavailable', 'incomplete']) test(`${status} assessment does not invent a decision, passing check or confidence`, async () => {
  const view = makeView({ execution: 'executed' });
  view.assessmentStatus = status; view.decision = 'unavailable';
  view.categories = status === 'unavailable' ? ['unavailable'] : ['pending'];
  view.rules = view.rules.map(rule => ({ ...rule, result: null, gateIds: null, contribution: 'unavailable' }));
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('[data-fact="result"]')?.textContent).toBe('Successful');
  expect(screen.container.querySelector('[data-fact="assessment"]')?.textContent).toBe(status[0]!.toUpperCase() + status.slice(1));
  expect(screen.container.querySelector('.assessment-status')?.textContent?.toLowerCase()).toContain(status);
  const records = await render(createElement(RecordedData, { view }));
  const captured = JSON.parse(records.container.querySelector('.exact-rule-data pre')!.textContent!);
  expect(captured.rules).toEqual(view.rules);
  expect(captured.rules.every((rule: { result: unknown; gateIds: unknown }) => rule.result === null && rule.gateIds === null)).toBe(true);
  expect(records.container.querySelector('.exact-rules')!.textContent).toContain('Missing data is not a pass');
});

test('suspected violations and uncertainty overlap without hiding severity or actual permission', async () => {
  const view = makeView({ choice: 'FAIL', execution: 'executed' });
  view.rules[0]!.gateIds!.push('rule-fail');
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('[data-fact="result"]')?.textContent).toBe('Successful');
  expect(screen.container.querySelector('[data-fact="findings"] .danger')?.textContent).toContain('Suspected violation');
  expect(screen.container.querySelector('[data-fact="findings"] .caution')?.textContent).toContain('Assessment uncertainty');
  const blockFacts = await render(createElement(RecordedData, { view }));
  expect(JSON.parse(blockFacts.container.querySelector('.exact-rule-data pre')!.textContent!).rules[0].enforcement).toBe('BLOCK');
  await blockFacts.unmount();
  view.rules[0]!.enforcement = 'WARN';
  const warnFacts = await render(createElement(RecordedData, { view }));
  expect(JSON.parse(warnFacts.container.querySelector('.exact-rule-data pre')!.textContent!).rules[0].enforcement).toBe('WARN');
  expect(warnFacts.container.querySelector('.exact-rules')!.textContent).toContain('WARN is advisory');
  expect(screen.container.querySelector('[data-fact="findings"] .danger')?.textContent).toContain('Suspected violation');
});

test('observe ASK is counterfactual, and enforced uncertainty can still be an actual block', async () => {
  const view = makeView({ choice: 'APPROVAL_REQUIRED', decision: 'ASK', execution: 'executed', gate: null });
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('[data-fact="findings"] .approval')?.textContent).toContain('Approval condition');
  await expect.element(screen.getByText('Approval was not requested in observe mode.', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('[data-fact="assessment"]')?.textContent).toBe('Would ask for approval in enforce mode');
  await screen.unmount();
  const enforced = makeView({ mode: 'enforce' });
  const blocked = await render(createElement(DecisionSummary, { view: enforced }));
  expect(blocked.container.querySelector('[data-fact="permission"]')?.textContent).toBe('Blocked by Tenet');
  expect(blocked.container.querySelector('.recorded-mode')?.textContent).toContain('Enforce');
  expect(blocked.container.querySelector('[data-fact="findings"] .caution')?.textContent).toContain('Assessment uncertainty');
});

test('missing historical mode and permission stay unknown even with approval and ALLOW', async () => {
  const view = makeView({ decision: 'ALLOW', permission: 'unknown', gate: null });
  delete (view.identity as any).mode; view.approval = 'approved';
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('[data-fact="permission"]')?.textContent).toBe('Unknown');
  expect(screen.container.querySelector('.recorded-mode')?.textContent).toContain('Mode unknown');
  expect(screen.container.querySelector('[data-fact="assessment"]')?.textContent).toBe('Allow');

});


test('named facts replace repeated permission and pending summary badges', async () => {
  const view = makeView({ permission: 'released', execution: 'unknown' });
  view.assessmentStatus = 'pending'; view.decision = 'unavailable'; view.reason = 'not-started'; view.categories = ['pending'];
  const screen = await render(createElement(DecisionSummary, { view }));
  expect(screen.container.querySelector('[data-fact="permission"]')?.textContent).toBe('Not blocked by Tenet');
  expect(screen.container.querySelector('[data-fact="result"]')?.textContent).toBe('Unknown / not recorded');
  expect(screen.container.querySelector('[data-fact="assessment"]')?.textContent).toBe('Pending');
  expect(screen.container.querySelectorAll('.primary-badges, .execution-summary, .finding-chips')).toHaveLength(0);
  expect(screen.container.textContent).not.toContain('Observation pending or incomplete');
  expect(screen.container.textContent).not.toContain('Ran');
});
