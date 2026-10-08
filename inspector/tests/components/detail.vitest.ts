import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import Detail from '../../src/Detail.js';
import PaneResizer from '../../src/PaneResizer.js';
import { makeView, recordedQuestion } from './fixtures.js';
import { invocationView } from '../../../src/inspector/view.js';
import { type ArchiveRecord } from '../../../src/recording/contract.js';
import '../../src/style.css';
import '../../src/summary.css';

test('the first view tells the call story and keeps diagnostics behind Recorded data', async () => {
  const screen = await render(createElement(Detail, { view: makeView({ execution: 'executed' }) }));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  await expect.element(screen.getByText('git status --short', { exact: true }).first()).toBeVisible();
  expect(screen.container.querySelector('[data-fact="result"]')?.textContent).toBe('Successful');
  expect(screen.container.querySelector('.recorded-mode')?.textContent).toContain('Observe');
  await expect.element(screen.getByText('Would block in enforce mode', { exact: true }).first()).toBeVisible();
  expect(screen.container.querySelector('.decision-map')).toBeNull();
  expect(screen.container.querySelector('.recorded-data')?.checkVisibility()).toBe(false);
  expect(screen.container.querySelector('.lifecycle')?.checkVisibility()).toBe(false);
  const entries = [...screen.container.querySelectorAll('.summary-content > details > summary')].map(el => el.textContent?.trim());
expect(entries).toEqual(['Why this assessment', 'Recorded data']);
  expect(screen.container.querySelector('.rule-question-link, .rule-questions, .rule-outcome, .recorded-rule-facts, .confidence-note')).toBeNull();
  await screen.getByText('Recorded data', { exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Submitted action' })).toBeVisible();
  await screen.getByText('Recording and coverage', { exact: true }).click();
  await expect.element(screen.getByText('Recording schemas', { exact: true })).toBeVisible();
});

test('expanded Details groups exact facts and bounds long identifiers at desktop and narrow widths', async () => {
  for (const width of [1280, 390]) {
    await page.viewport(width, 1000);
    const view = makeView({ execution: 'unknown', permission: 'blocked' });
    const id = 'recorded-identifier-'.repeat(160);
    view.identity!.invocationId = id;
    const screen = await render(createElement(Detail, { view }));
    await screen.getByText('Recorded data', { exact: true }).click();
    await screen.getByText('Recording and coverage', { exact: true }).click();
    expect([...screen.container.querySelectorAll('.recording-details .record-group > h3')].map(el => el.textContent)).toEqual(['Recorded outcomes', 'Recording', 'Coverage and limits']);
    const facts = screen.container.querySelector('.recording-details .lifecycle')!;
    expect(facts.textContent).toContain('blocked');
    expect(facts.textContent).toContain('unknown');
    expect(getComputedStyle(facts).display).toBe('grid');
    await screen.getByText('Record identifiers', { exact: true }).click();
    const value = screen.container.querySelector<HTMLTextAreaElement>('.record-identifiers .record-id')!;
    expect(value.value).toBe(id);
    expect(value.clientHeight).toBeLessThanOrEqual(100);
    expect(value.scrollHeight).toBeGreaterThan(value.clientHeight);
    expect(screen.container.querySelector('.recording-details')!.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    await screen.getByText('Interpretation limits', { exact: true }).click();
    await expect.element(screen.getByText(/does not certify that every host path was prevented/)).toBeVisible();
    await screen.unmount();
  }
  await page.viewport(1280, 720);
});

test('exact questions are keyboard accessible, inert, and separate from submitted evidence', async () => {
  const view = makeView();
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  const exact = screen.container.querySelector<HTMLDetailsElement>('.exact-rules')!;
  exact.querySelector<HTMLElement>('summary')!.focus();
  await userEvent.keyboard('{Enter}');
  expect(exact.open).toBe(true);
  await userEvent.keyboard('{Tab}');
  expect(document.activeElement).toBe(exact.querySelector('.exact-rule-data'));
  const captured = JSON.parse(exact.querySelector('pre')!.textContent!);
  expect(captured.rules[0].questions.outcome).toEqual(recordedQuestion);
  expect(exact.querySelector('script, img, a, iframe, object')).toBeNull();
});

test('resizer clamps pointer and keyboard updates at desktop and mobile widths', async () => {
  for (const width of [1280, 390]) {
    await page.viewport(width, 844);
    const screen = await render(createElement(PaneResizer, { value: 300, min: 220, max: 460, label: 'Resize call explorer', controls: 'call-explorer' }));
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

test('all recorded outcomes, selected evidence and SUFFICIENT probabilities retain their separate meanings', async () => {
  for (const choice of ['PASS', 'FAIL', 'APPROVAL_REQUIRED', 'UNKNOWN']) {
    const view = makeView({ choice });
    const rule = view.rules[0]!;
    rule.result!.outcome!.probabilities = { PASS: .88123456789, FAIL: .07123456789, UNKNOWN: .04753086422 };
    rule.result!.evidence = { choice: 'INSUFFICIENT', probabilities: { INSUFFICIENT: .85123456789, SUFFICIENT: .14876543211 } };
    rule.thresholds = { effectThreshold: .9123456789, evidenceThreshold: .9323456789 };
    rule.gateIds = ['outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold', 'historical-unknown-gate'];
    const screen = await render(createElement(Detail, { view }));
    const data = JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!);
    expect(data.rules).toEqual(view.rules);
    expect(data.rules[0].result.outcome.choice).toBe(choice);
    expect(data.rules[0].result.evidence.choice).toBe('INSUFFICIENT');
    expect(data.rules[0].result.evidence.probabilities.SUFFICIENT).toBe(.14876543211);
    expect(data.rules[0].gateIds).toEqual(rule.gateIds);
    expect(screen.container.querySelector('.rule-question-link, .rule-outcome, .confidence-note')).toBeNull();
    await screen.unmount();
  }
});

test('unavailable evidence and confidence are not replaced with zeros, passes or current thresholds', async () => {
  const view = makeView({ evidence: false });
  const rule = view.rules[0]!;
  rule.result = null; rule.gateIds = null; rule.thresholds = { effectThreshold: null, evidenceThreshold: null };
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  const data = JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!);
  expect(data.rules).toEqual(view.rules);
  expect(data.rules[0].result).toBeNull(); expect(data.rules[0].thresholds.effectThreshold).toBeNull();
  expect(data.rules[0].questions).toBeNull(); expect(data.rules[0].mapping).toBeNull();
  expect(screen.container.querySelector('.exact-rules')!.textContent).toContain('Missing data is not a pass');
  expect(screen.container.querySelector('[data-rule-id="rule-one"] [role="meter"]')).toBeNull();
});


for (const choice of ['FAIL', 'APPROVAL_REQUIRED']) test(`historical ${choice} remains exact beside PASS without inventing absent diagnostics`, async () => {
  const policy = { rules: [
    { id: 'pass', text: 'Recorded passing rule.', line: 1, enforcement: 'BLOCK' },
    { id: 'affected', text: 'Recorded affected rule.', line: 2, enforcement: 'BLOCK' },
  ] };
  const stages = [
    { stage: 'begin', data: { policy } },
    { stage: 'validation', data: { valid: true } },
    { stage: 'assessment', data: { assessment: { model: 'offline', rules: policy.rules.map(rule => ({
      ruleId: rule.id, outcome: { choice: rule.id === 'pass' ? 'PASS' : choice, probabilities: rule.id === 'pass' ? { PASS: .95, FAIL: .02, APPROVAL_REQUIRED: .03 } : choice === 'FAIL' ? { PASS: .02, FAIL: .95, APPROVAL_REQUIRED: .03 } : { PASS: .02, FAIL: .03, APPROVAL_REQUIRED: .95 } },
      evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .95, INSUFFICIENT: .05 } },
    })) } } },
    { stage: 'decision', data: { decision: choice === 'FAIL' ? 'BLOCK' : 'ASK', reason: choice === 'FAIL' ? 'rule-failed' : 'approval-required' } },
  ];
  const records = stages.map((record, sequence) => ({ ...record, sequence: sequence + 1,
    schemaVersion: 1, writerId: '00000000-0000-0000-0000-000000000000', eventId: `00000000-0000-0000-0000-${String(sequence).padStart(12, '0')}`, sessionId: 'historical', invocationId: 'historical-call', callId: 'historical-call',
    toolName: 'bash', cwd: '/fictional', mode: 'observe', timestamp: sequence + 1,
  }));
  const view = invocationView(records as ArchiveRecord[]);
  expect(view.assessmentStatus).toBe('validated');
  expect(view.categories).toContain(choice === 'FAIL' ? 'violation' : 'approval');
  expect(view.rules.map(rule => rule.gateIds)).toEqual([null, null]);
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  const data = JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!);
  expect(data.rules).toEqual(view.rules);
  expect(data.rules.map((rule: { id: string }) => rule.id)).toEqual(['pass', 'affected']);
  expect(data.rules[1].result.outcome.choice).toBe(choice);
  expect(data.rules.every((rule: { gateIds: unknown }) => rule.gateIds === null)).toBe(true);
  expect(data.rules.every((rule: { thresholds: { effectThreshold: unknown } }) => rule.thresholds.effectThreshold === null)).toBe(true);
  expect(screen.container.querySelector('.rule-question-link, .rule-questions, .rule-outcome')).toBeNull();
});

for (const [width, fontSize] of [[1103, 16], [390, 16], [1103, 32]] as const) test(`remaining roles and exact records wrap at ${width}px with ${fontSize}px root text`, async () => {
  const previous = document.documentElement.style.fontSize;
  await page.viewport(width, 1318);
  document.documentElement.style.fontSize = `${fontSize}px`;
  try {
    const view = makeView();
    view.rules[0]!.text = 'Long recorded rule with 雪 and 😀 '.repeat(80);
    const screen = await render(createElement(Detail, { view }));
    await screen.getByText('Recorded data', { exact: true }).click();
    await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
    const data = screen.container.querySelector<HTMLElement>('.exact-rule-data')!;
    const body = screen.container.querySelector<HTMLElement>('.recorded-data .muted')!;
    expect(getComputedStyle(body).fontSize).toBe(`${fontSize}px`);
    expect(getComputedStyle(data.querySelector('pre')!).fontSize).toBe(`${fontSize * .875}px`);
    expect(getComputedStyle(data.querySelector('pre')!).overflowWrap).toBe('anywhere');
    expect(data.getBoundingClientRect().right).toBeLessThanOrEqual(width);
    expect(JSON.parse(data.querySelector('pre')!.textContent!).rules).toEqual(view.rules);
    expect(screen.container.querySelector('.exact-rules > summary')!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await screen.unmount();
  } finally {
    document.documentElement.style.fontSize = previous;
    await page.viewport(1280, 720);
  }
});
test('precision rejection is readable at desktop and mobile widths without implying a violation', async () => {
  for (const width of [1280, 390]) {
    await page.viewport(width, 844);
    const view = makeView({ failure: 'invalid-response', gate: null });
    view.validationIssue = 'unit-sum';
    const screen = await render(createElement(Detail, { view }));
    await screen.getByText('Recorded data', { exact: true }).click();
    await screen.getByText('Recording and coverage', { exact: true }).click();
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
