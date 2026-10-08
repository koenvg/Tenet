import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { test, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import Detail from '../../src/Detail.js';
import { makeView } from './fixtures.js';

for (const width of [1103, 390]) test(`compact recorded text and precise confidence readings at ${width}px`, async () => {
  await page.viewport(width, 1318);
  const view = makeView();
  const first = view.rules[0]!;
  first.text = '<img src="https://hostile.invalid"> Recorded 雪 😀 rule';
  first.result!.outcome!.probabilities.PASS = .88123456789;
  first.result!.evidence = { choice: 'INSUFFICIENT', probabilities: { INSUFFICIENT: .85123456789, SUFFICIENT: .14876543211 } };
  first.thresholds = { effectThreshold: .9123456789, evidenceThreshold: .9323456789 };
  first.gateIds = ['outcome-confidence-below-threshold', 'evidence-confidence-below-threshold', 'evidence-insufficient'];
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Why this assessment', { exact: true }).click();
  const rule = screen.container.querySelector('.rule-detail')!;
  expect(rule.querySelector('h3')!.textContent).toBe(first.text);
  expect(rule.querySelector('img, script, a, button')).toBeNull();
  const readings = rule.querySelectorAll('.confidence-reading');
  expect(readings).toHaveLength(2);
  for (const [index, values] of [[0, ['.88123456789', '.9123456789']], [1, ['.14876543211', '.9323456789']]] as const) {
    const displayed = readings[index]!.querySelector('.confidence-values')!.textContent!;
    for (const value of values) expect(displayed.split(value)).toHaveLength(2);
    expect(readings[index]!.classList.contains('low-confidence')).toBe(true);
  }
  expect(readings[1]!.querySelector('.selected-evidence-confidence')!.textContent).toContain('Selected INSUFFICIENT confidence: 0.85123456789');
  expect(readings[1]!.querySelector('[role=meter]')!.getAttribute('aria-valuenow')).toBe('0.14876543211');
  expect(rule.textContent).toContain('Insufficient evidence');
  expect(screen.container.querySelector('.rule-outcome, .confidence-note, .recorded-rule-facts, .rule-question-link, .rule-questions')).toBeNull();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  await screen.unmount();
  await page.viewport(1280, 720);
});

test('bars use recorded gates, not a new comparison; unknown and non-applicable readings remain honest', async () => {
  const view = makeView({ gate: null });
  const rule = view.rules[0]!;
  rule.thresholds.effectThreshold = .99; // Existing selected probability is lower; no gate was recorded.
  rule.evidenceGate = 'not-applicable';
  rule.result!.evidence = { choice: 'NOT_APPLICABLE', probabilities: { NOT_APPLICABLE: 1, SUFFICIENT: 0 } };
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Why this assessment', { exact: true }).click();
  const node = screen.container.querySelector('[data-rule-id="rule-one"]')!;
  expect(node.querySelector('.low-confidence')).toBeNull();
  expect(node.querySelectorAll('.confidence-reading')).toHaveLength(1);
  expect(node.textContent).toContain('does not apply. No evidence score was recorded.');
  const next = structuredClone(view);
  next.rules[0]!.gateIds = null;
  next.rules[0]!.result = null;
  next.rules[0]!.thresholds.effectThreshold = null;
  await screen.rerender(createElement(Detail, { view: next }));
  expect(screen.container.querySelector('[data-rule-id="rule-one"]')).toBe(node);
  expect(node.querySelector('[role=meter]')).toBeNull();
  expect(node.textContent).toContain('Gate coverage unavailable: not recorded.');
  expect(node.textContent).toContain('Outcome unavailable Unknown / not recorded');
  expect(node.textContent).toContain('Required Unknown / not recorded');
});

test('historical FAIL and approval precede passes, retain identity through reordered delayed updates', async () => {
  const view = makeView({ gate: null });
  const pass = view.rules[0]!;
  const fail = { ...structuredClone(pass), id: 'historical-fail', text: 'Historical integrity rule', builtin: true, gateIds: null };
  fail.result!.outcome!.choice = 'FAIL';
  const approval = { ...structuredClone(pass), id: 'historical-approval', text: 'Historical approval', gateIds: null };
  approval.result!.outcome!.choice = 'APPROVAL_REQUIRED';
  approval.contribution = 'approval-required';
  const warn = { ...structuredClone(fail), id: 'warn', builtin: false, enforcement: 'WARN', contribution: 'advisory-gates', gateIds: ['rule-fail'] };
  const advisoryApproval = { ...structuredClone(warn), id: 'advisory-approval', contribution: 'advisory-approval' };
  const unknown = { ...structuredClone(pass), id: 'unknown', text: 'Unknown rule', gateIds: ['outcome-unknown', 'historical-unrecognized-gate'] };
  unknown.result!.outcome!.choice = 'UNKNOWN';
  view.rules = [pass, warn, approval, fail, unknown, advisoryApproval];
  const screen = await render(createElement(Detail, { view }));
  const disclosure = screen.container.querySelector<HTMLDetailsElement>('.why-disclosure')!;
  const summary = disclosure.querySelector<HTMLElement>('summary')!;
  summary.focus(); await userEvent.keyboard('{Enter}');
  expect(disclosure.open).toBe(true);
  expect([...screen.container.querySelectorAll<HTMLElement>('.rule-detail')].map(n => n.dataset.ruleId)).toEqual(['historical-approval', 'historical-fail', 'unknown', 'warn', 'advisory-approval', 'rule-one']);
  const failNode = screen.container.querySelector('[data-rule-id="historical-fail"]')!;
  expect(failNode.textContent).toContain('Built-in integrity');
  expect(failNode.querySelector('.confidence-values')!.textContent).toContain('FAIL');
  expect(screen.container.querySelector('[data-rule-id="historical-approval"]')!.textContent).toContain('Approval was not requested in observe mode.');
  expect(screen.container.querySelector('[data-rule-id="warn"]')!.textContent).toContain('WARN does not block');
  expect(screen.container.querySelector('[data-rule-id="advisory-approval"]')!.textContent).toContain('WARN does not request confirmation.');
  expect(screen.container.querySelector('[data-rule-id="unknown"]')!.textContent).toContain('Unknown does not mean passed');
  expect(screen.container.querySelector('[data-rule-id="unknown"]')!.textContent).toContain('Unrecognized recorded gate');
  const next = structuredClone(view); next.rules.reverse();
  next.identity!.mode = 'enforce';
  await screen.rerender(createElement(Detail, { view: next }));
  expect(screen.container.querySelector('[data-rule-id="historical-fail"]')).toBe(failNode);
  expect(screen.container.querySelector('.why-disclosure')).toBe(disclosure);
  expect(screen.container.querySelector('[data-rule-id="historical-approval"]')!.textContent).toContain('Requires approval. Another rule may still block the invocation.');
  expect(disclosure.open).toBe(true);
  expect(document.activeElement).toBe(summary);
});

import '../../src/style.css';
import '../../src/summary.css';
