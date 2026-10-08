import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import Detail from '../../src/Detail.js';
import { makeView, recordedQuestion } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

test('one Recorded data entry replaces the dock and Details, leading with submitted edit and policy', async () => {
  const view = makeView();
  view.evidence!.action.arguments = { path: 'src/billing.ts', oldText: 'before\n<original>', newText: 'after\n<script>inert</script>' };
  const screen = await render(createElement(Detail, { view }));
  expect([...screen.container.querySelectorAll('.summary-content > details > summary')].map(el => el.textContent?.trim())).toEqual(['Why this assessment', 'Recorded data']);
  await screen.getByText('Recorded data', { exact: true }).click();
  await expect.element(screen.getByText('src/billing.ts', { exact: true }).last()).toBeVisible();
  await expect.element(screen.getByText('Submitted before text', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('Submitted after text', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('[aria-label="Submitted action"]')!.textContent).toContain('not proof that the tool ran');
  expect(screen.container.querySelectorAll('.evidence-dock, .dock-tabs, .format-toggle')).toHaveLength(0);
  expect([...screen.container.querySelectorAll('.recorded-data > section > h3')].slice(0, 2).map(el => el.textContent)).toEqual(['Submitted action', 'Captured policy']);
});

test('one exact destination contains every retained rule, mapping, choice and question without readable question UI', async () => {
  const view = makeView();
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  const data = JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!);
  expect(data).toEqual({ questionVersion: view.questionVersion, rules: view.rules });
  expect(data.rules[0].questions.outcome).toEqual(recordedQuestion);
  expect(screen.container.querySelectorAll('.exact-rules')).toHaveLength(1);
  expect(screen.container.querySelectorAll('.rule-question-link, .rule-questions, .question-rich, .question-exact, .rule-outcome, .recorded-rule-facts, .confidence-note')).toHaveLength(0);
  expect(screen.container.querySelectorAll('.exact-rule-data script, .exact-rule-data img, .exact-rule-data a')).toHaveLength(0);
});


test('arbitrary and malformed arguments stay honest and preserve captured null values', async () => {
  for (const args of [undefined, null, ['arbitrary'], 'malformed', { custom: '<img src="https://hostile.invalid/probe">', oldText: null, count: 0.1234567890123456 }]) {
    const view = makeView();
    view.evidence!.action.arguments = args;
    const screen = await render(createElement(Detail, { view }));
    await screen.getByText('Recorded data', { exact: true }).click();
    if (args && typeof args === 'object' && !Array.isArray(args)) {
      const submitted = screen.container.querySelector('.submitted-fields')!;
      expect(submitted.textContent).toContain('null');
      expect(submitted.textContent).toContain('0.1234567890123456');
      await expect.element(screen.getByText('Submitted after text unavailable: not recorded.', { exact: true })).toBeVisible();
    } else {
      await expect.element(screen.getByText(/Readable submitted arguments unavailable/)).toBeVisible();
      expect(screen.container.querySelector('.decision-summary .action-unavailable')!.textContent).toContain('See Recorded data');
    }
    await screen.getByText('Exact submitted action JSON', { exact: true }).click();
    const captured = JSON.parse(screen.container.querySelector('.exact-action pre')!.textContent!);
    expect(captured).toEqual(args === undefined ? {} : { arguments: args });
    expect(screen.container.querySelectorAll('.submitted-fields img, .submitted-fields a, .submitted-fields script')).toHaveLength(0);
    await screen.unmount();
  }
});


test('shared state, reference pools, loss markers, policy identity and exact mappings retain their captured values', async () => {
  const view = makeView();
  const long = '  original\n\t雪😀 <script>inert</script>  '.repeat(600);
  view.evidence!.action.arguments = { path: 'fictional.ts', oldText: long, newText: '' };
  view.evidence!.context = { redaction: '[REDACTED]', nullValue: null };
  view.evidence!.trajectory = { observations: [{ timestamp: 2, data: { tenetHistory: { ref: 'v0' } } }, { timestamp: 1, omitted: '[OMITTED]' }], values: { v0: long }, losses: { shortened: 3, dropped: 2 } };
  view.evidence!.unknownSection = { exact: 0.1234567890123456 };
  view.policy.source = '/fictional/TENET.md'; view.policy.target = '/fictional/resolved.md'; view.policy.digest = 'captured-digest';
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  expect(screen.container.querySelectorAll('.submitted-string')[1]!.textContent).toBe(long);
  await screen.getByText('Exact submitted evidence', { exact: true }).click();
  for (const section of screen.container.querySelectorAll('.evidence-section')) {
    const key = section.querySelector('.question-key')!.textContent!.slice(6);
    expect(JSON.parse(section.querySelector('pre')!.textContent!)).toEqual(view.evidence![key]);
  }
  await screen.getByText('Policy identity and exact JSON', { exact: true }).click();
  expect(JSON.parse(screen.container.querySelector('.exact-policy pre')!.textContent!)).toEqual(view.policy);
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  expect(JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!)).toEqual({ questionVersion: view.questionVersion, rules: view.rules });
});

test('response loss and unavailable snapshots stay separate from validation and recorded approval', async () => {
  for (const response of [null, { unavailable: true }, { truncated: true, bytes: 2000000, preview: '<script>inert</script>' }, { value: { probability: 0.1234567890123456 }, bytes: 38, truncated: false }]) {
    const view = makeView({ mode: 'enforce', decision: 'ASK' });
    view.response = response;
    view.approval = 'approved';
    view.validation = { valid: false, validationIssue: 'unit-sum' };
    const screen = await render(createElement(Detail, { view }));
    await screen.getByText('Recorded data', { exact: true }).click();
    await screen.getByText('Application response and validation', { exact: true }).click();
    const content = screen.container.querySelector('.recorded-response')!;
    if (response === null) expect(content.textContent).toContain('does not prove the provider returned nothing');
    else if ('unavailable' in response) expect(content.textContent).toContain('Response snapshot unavailable');
    else if (response.truncated) expect(content.textContent).toContain('2000000 bytes');
    else expect(content.textContent).toContain('0.1234567890123456');
    expect(content.textContent).toContain('unit-sum');
    await screen.getByText('Recording and coverage', { exact: true }).click();
    expect(screen.container.querySelector('.lifecycle')!.textContent).toContain('approved');
    expect(screen.container.querySelector('.lifecycle')!.textContent).toContain('unknown');
    await screen.unmount();
  }
});

test('unchanged and delayed stages preserve exact records, evidence DOM, open disclosures, scroll and focus', async () => {
  const view = makeView();
  view.evidence!.trajectory = { history: 'captured history\n'.repeat(200) };
  view.rules[0]!.questions!.outcome = { ...recordedQuestion, instructions: 'captured question '.repeat(1000) };
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Exact submitted evidence', { exact: true }).click();
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  const evidence = screen.container.querySelector<HTMLElement>('.submitted-evidence')!;
  const exact = screen.container.querySelector<HTMLElement>('.exact-rule-data')!;
  const records = screen.container.querySelector<HTMLDetailsElement>('.exact-rules')!;
  evidence.scrollTop = 37; exact.scrollTop = 83; exact.focus();
  const focus = document.activeElement;
  for (const next of [structuredClone(view), { ...structuredClone(view), execution: 'executed', response: { value: 'delayed result', bytes: 14 } }]) {
    await screen.rerender(createElement(Detail, { view: next }));
    expect(screen.container.querySelector('.submitted-evidence')).toBe(evidence);
    expect(screen.container.querySelector('.exact-rule-data')).toBe(exact);
    expect(screen.container.querySelector('.exact-rules')).toBe(records);
    expect(evidence.scrollTop).toBe(37); expect(exact.scrollTop).toBe(83);
    expect(records.open).toBe(true); expect(document.activeElement).toBe(focus);
    expect((screen.container.querySelector('.recorded-disclosure') as HTMLDetailsElement).open).toBe(true);
    expect(JSON.parse(exact.querySelector('pre')!.textContent!).rules).toEqual(next.rules);
  }
});


test('arbitrary keys are displayed literally even when they match JavaScript object properties', async () => {
  const view = makeView();
  view.evidence!.action.arguments = Object.fromEntries([['__proto__', 'recorded prototype text'], ['constructor', 'recorded constructor text']]);
  view.evidence!.constructor = { captured: true };
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  expect([...screen.container.querySelectorAll('.submitted-fields dt')].map(el => el.textContent)).toEqual(['__proto__', 'constructor']);
  await screen.getByText('Exact submitted evidence', { exact: true }).click();
  expect([...screen.container.querySelectorAll('.evidence-section h4')].map(el => el.textContent)).toContain('constructor');
});


test('accepted UTF-16 rule identities remain distinct and lossless in exact records through polling', async () => {
  const view = makeView({ callId: 'fictional-\ud800' });
  view.rules[0]!.id = 'rule-\ud800'; view.rules[1]!.id = 'rule-\ud801';
  view.rules.push({ ...view.rules[0]!, id: 'rule-\ufffd' });
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  const exact = screen.container.querySelector<HTMLElement>('.exact-rule-data')!;
  exact.focus();
  for (const next of [view, structuredClone(view)]) {
    await screen.rerender(createElement(Detail, { view: next }));
    const ids = JSON.parse(exact.querySelector('pre')!.textContent!).rules.map((rule: { id: string }) => rule.id);
    expect(ids).toEqual(view.rules.map(rule => rule.id)); expect(new Set(ids).size).toBe(3);
    expect(screen.container.querySelector('.exact-rule-data')).toBe(exact);
    expect(document.activeElement).toBe(exact);
  }
});

for (const response of [null, { unavailable: true }, { truncated: true, bytes: 2000000, preview: 'not the retained assessment' }]) test(`complete exact records survive ${response === null ? 'missing' : response.unavailable ? 'unavailable' : 'truncated'} response`, async () => {
  const view = makeView();
  view.response = response;
  const rule = view.rules[0]!;
  rule.result!.outcome = { choice: 'PASS', probabilities: { PASS: .88123456789, FAIL: .07123456789, UNKNOWN: .04753086422 } };
  rule.result!.evidence = { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: .12345678901, INSUFFICIENT: .87654321099 } };
  rule.thresholds = { effectThreshold: .9123456789, evidenceThreshold: .9323456789 };
  rule.gateIds = ['outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold', 'historical-unknown-gate'];
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  const exact = screen.container.querySelector('.exact-rules')!;
  const text = exact.querySelector('pre')!.textContent!;
  expect(JSON.parse(text)).toEqual({ questionVersion: view.questionVersion, rules: view.rules });
  expect(text).not.toContain('not the retained assessment');
  expect(exact.textContent).toContain('not calibrated safety guarantees');
  expect(exact.textContent).toContain('Missing data is not a pass');
  expect(exact.textContent).toContain('WARN is advisory');
});

test('unknown integrity, missing gates and non-applicable evidence preserve exact markers and thresholds', async () => {
  for (const gates of [null, [], ['historical-unknown-gate']]) {
    const view = makeView();
    const rule = view.rules[0]!;
    rule.builtin = true; rule.result = { outcome: { choice: 'UNKNOWN', probabilities: {} }, evidence: null };
    rule.gateIds = gates; rule.contribution = 'unavailable'; rule.evidenceGate = 'not-applicable';
    rule.thresholds = { effectThreshold: null, evidenceThreshold: .987654321 };
    view.response = { unavailable: true };
    const screen = await render(createElement(Detail, { view }));
    await screen.getByText('Recorded data', { exact: true }).click();
    await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
    const captured = JSON.parse(screen.container.querySelector('.exact-rule-data pre')!.textContent!);
    expect(captured.rules).toEqual(view.rules);
    expect(captured.rules[0].gateIds).toEqual(gates);
    expect(captured.rules[0].result.evidence).toBeNull();
    expect(captured.rules[0].thresholds.evidenceThreshold).toBe(.987654321);
    expect(screen.container.querySelector('.exact-rules')!.textContent).toContain('Non-applicable evidence has no evidence score');
    await screen.unmount();
  }
});

test('missing records, question version and mappings are explicit and never reconstructed', async () => {
  const view = makeView({ evidence: false });
  view.rules = [];
  const screen = await render(createElement(Detail, { view }));
  await screen.getByText('Recorded data', { exact: true }).click();
  await screen.getByText('Exact rule records and captured questions', { exact: true }).click();
  const exact = screen.container.querySelector('.exact-rules')!;
  expect(exact.textContent).toContain('No retained rule records or questions available');
  expect(JSON.parse(exact.querySelector('pre')!.textContent!)).toEqual({ questionVersion: null, rules: [] });
});
