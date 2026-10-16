import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { createElement } from 'react';
import { page } from 'vitest/browser';
import SummaryDetail from '../../src/shared/SummaryDetail.js';
import { standaloneSummary } from '../../src/shared/standalone-adapter.js';
import { makeView } from './fixtures.js';
import type { SummaryDecision } from '../../src/shared/model.js';

import { projectSummaryDecision } from '../../../src/inspector/bb-summary.js';
import { invocationView } from '../../../src/inspector/view.js';
import { selectedPassRecords } from '../../../test/selected-summary-fixture.js';
function selectedView(): SummaryDecision {
  const view = standaloneSummary(makeView({ choice: 'FAIL' }));
  return { ...view, identity: { callId: 'selected', toolName: 'bash', mode: 'observe' },
    recordedAction: { field: 'command', text: '  echo "雪  x"\n<script>window.callProbe=true</script>', truncated: false },
    reportedViolations: { assessment: 'validated', uncertain: true, total: 20, missingRuleSnapshots: 0,
      items: Array.from({ length: 16 }, (_, i) => ({ id: `r${i}`, text: i === 1 ? 'x'.repeat(2038) + ' [omitted]' : i === 2 ? 'Rule text unavailable' : `Recorded rule ${i}.`,
        enforcement: i === 0 ? 'WARN' : 'BLOCK', uncertain: i === 0, textStatus: i === 1 ? 'truncated' : i === 2 ? 'missing' : 'recorded', omittedTextChars: i === 1 ? 962 : 0 })) } };
}

for (const width of [390, 1280]) test(`selected call opens only recorded action and whole-call FAIL text at ${width}px`, async () => {
  await page.viewport(width, 900);
  const view = selectedView();
  const screen = await render(createElement(SummaryDetail, { view, moreRules: true, loadMoreRules() {} }));
  await expect.element(screen.getByRole('region', { name: 'Recorded call' })).toBeVisible();
  const action = screen.container.querySelector('.recorded-action code')!;
  expect(action.textContent).toBe('  echo "雪  x"\n<script>window.callProbe=true</script>');
  expect(getComputedStyle(action.parentElement!).whiteSpace).toBe('pre-wrap');
  await expect.element(screen.getByText('Recorded rule 15.', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('20 reported violations. Showing 16. Browse all rules for the remaining recorded rules.')).toBeVisible();
  await expect.element(screen.getByText('Advisory · Assessment uncertain')).toBeVisible();
  await expect.element(screen.getByText('Rule text shortened. 962 characters omitted.')).toBeVisible();
  await expect.element(screen.getByText('Rule text unavailable.', { exact: true })).toBeVisible();
  for (const selector of ['.primary-badges', '.execution-summary', '.assessment-state', '.summary-privacy-note', '.decision-map']) expect(screen.container.querySelector(selector)?.checkVisibility()).toBe(false);
  expect(screen.container.querySelector('script')).toBeNull();
  expect(Object.hasOwn(window, 'callProbe')).toBe(false);
  expect(screen.container.textContent).not.toContain('PRIVATE-');
  expect(screen.container.scrollWidth).toBeLessThanOrEqual(screen.container.clientWidth);
  await screen.getByText('Recording details', { exact: true }).click();
  expect(screen.container.querySelector('.record-fields dd')?.textContent).toBe('selected');
  await expect.element(screen.getByText('Recorded assessment: completed.')).toBeVisible();
});

test('missing validation never becomes a clean result and a confidence-only block is not a violation', async () => {
  const view = selectedView();
  view.recordedAction = null;
  view.reportedViolations = { assessment: 'unavailable', uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 };
  const absent = await render(createElement(SummaryDetail, { view }));
  await expect.element(absent.getByText('Recorded command or path unavailable.')).toBeVisible();
  await expect.element(absent.getByText('Reported violations unavailable. No validated complete assessment.')).toBeVisible();
  expect(absent.container.innerText).not.toMatch(/No rule was reported|passed/i);
  await absent.unmount();
  view.reportedViolations = { assessment: 'validated', uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 };
  view.noRulesClassifiedViolated = false;
  const screen = await render(createElement(SummaryDetail, { view }));
  await expect.element(screen.getByText('No reported violations. Assessment coverage is uncertain.')).toBeVisible();
  expect(screen.container.querySelectorAll('.reported-violations li')).toHaveLength(0);
});

for (const [name, choice, gate, enforcement, label] of [
  ['WARN FAIL', 'FAIL', 'rule-fail', 'WARN', 'Advisory'],
  ['uncertain FAIL', 'FAIL', 'evidence-insufficient', 'BLOCK', 'Assessment uncertain'],
  ['missing gates FAIL', 'FAIL', null, 'BLOCK', 'Assessment uncertain'],
  ['approval', 'APPROVAL_REQUIRED', null, 'BLOCK', null],
  ['confidence-only PASS', 'PASS', 'outcome-confidence-below-threshold', 'BLOCK', null],
] as const) test(`compact selected ${name} keeps reported violations distinct`, async () => {
  const privateView = makeView({ choice, gate });
  privateView.rules[0]!.enforcement = enforcement;
  if (name === 'missing gates FAIL') privateView.rules[0]!.gateIds = null;
  const view = standaloneSummary(privateView);
  const screen = await render(createElement(SummaryDetail, { view }));
  const list = screen.container.querySelector('.reported-violations')!;
  expect(list.querySelectorAll('li')).toHaveLength(choice === 'FAIL' ? 1 : 0);
  if (choice === 'FAIL') await expect.element(screen.getByText('Never send an email without confirmation.', { exact: true }).first()).toBeVisible();
  if (label) expect(list.textContent).toContain(label);
});

test('whole-call reported rule beyond page one and unavailable snapshots remain visible without loading pages', async () => {
  const view = selectedView();
  view.recordedAction!.truncated = true;
  view.rules = [];
  view.reportedViolations = { assessment: 'validated', uncertain: false, total: 2, missingRuleSnapshots: 1,
    items: [{ id: 'last-rule', text: 'Recorded rule on page two.', enforcement: 'BLOCK', uncertain: false, textStatus: 'recorded' }] };
  const screen = await render(createElement(SummaryDetail, { view }));
  await expect.element(screen.getByText('Recorded rule on page two.', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('1 reported violation has no recorded rule snapshot. Rule text unavailable.')).toBeVisible();
  await expect.element(screen.getByText('Recorded value shortened to fit 4096 UTF-8 bytes.')).toBeVisible();
});

for (const gate of ['outcome-confidence-below-threshold', null]) test(`whole-call PASS keeps uncertainty beyond rule 17 with ${gate ?? 'missing selected gates'}`, async () => {
  const rows = selectedPassRecords(gate);
  const first = projectSummaryDecision(rows), last = projectSummaryDecision(rows, 16);
  const standalone = standaloneSummary(invocationView(rows));
  expect(first.categories).toEqual([]);
  expect(first.noRulesClassifiedViolated).toBe(true);
  expect(standalone.reportedViolations).toEqual(first.reportedViolations);
  for (const view of [first, last, standalone]) {
    const screen = await render(createElement(SummaryDetail, { view }));
    await expect.element(screen.getByText('No reported violations. Assessment coverage is uncertain.')).toBeVisible();
    expect(screen.container.innerText).not.toContain('No rule was reported as violated.');
    await screen.unmount();
  }
  (rows.find(r => r.stage === 'decision')!.data as any).contributions[19].gates = [];
  const clean = await render(createElement(SummaryDetail, { view: projectSummaryDecision(rows) }));
  await expect.element(clean.getByText('No rule was reported as violated.')).toBeVisible();
});
