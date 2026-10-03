import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { recordSessionKey, recordInvocationKey } from '../../../src/recording/archive.js';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';
import { openEvidence, reveal } from '../ui-navigation.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);

type Schema = 1 | 2 | 3 | 4;
const identity = { sessionId: 'status', invocationId: 'ran', callId: 'ran',
  toolName: 'read', cwd: '/synthetic', mode: 'observe' as const };
const address = (schemaVersion: Schema) => ({ ...identity, schemaVersion, host: 'pi', contextId: 'main' });
const link = (schema: Schema) => `/?session=${recordSessionKey(address(schema))}&invocation=${recordInvocationKey(address(schema))}`;
const bind = (writer: FixtureArchiveWriter, schema: Schema) => schema === 1 ? writer.bind(identity)
  : schema === 4 ? writer.bind(address(schema)) : writer.bindHistorical(address(schema), schema);
const question = { type: 'choice', instructions: 'Historical authored question, not current instructions.',
  criteria: { PASS: 'Satisfied.', FAIL: 'Violated.', UNKNOWN: 'Uncertain.', APPROVAL_REQUIRED: 'Requires confirmation.' } };
const policy = { source: '/synthetic/TENET.md', digest: 'synthetic', target: '/synthetic/TENET.md',
  rules: [{ id: 'r', text: 'Keep private data local.', line: 4, enforcement: 'BLOCK' }] };
const evidence = { action: { arguments: { path: '/synthetic/notes.txt' } }, policy, context: {},
  trajectory: { history: Array.from({ length: 80 }, (_, i) => `Authored inert evidence ${i}`) }, integrity: {} };
function complete(sink: ReturnType<typeof bind>) {
  sink('validation', { valid: true });
  sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'r',
    outcome: { choice: 'PASS', probabilities: { PASS: .88, FAIL: .02, UNKNOWN: .05, APPROVAL_REQUIRED: .05 } },
    evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .85, INSUFFICIENT: .15 } } }] } });
  sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', contributions: [{ ruleId: 'r', contribution: 'blocking-gates',
    gates: ['outcome-confidence-below-threshold', 'evidence-confidence-below-threshold'], effectThreshold: .91, evidenceThreshold: .93 }] });
}
// Authored inert records, never fixture-action dispatch or evaluator replay.
async function seedStatus(directory: string, options: { schema?: Schema; execution?: string | null; permission?: string | null; pending?: boolean } = {}) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  const sink = bind(writer, options.schema ?? 1);
  sink('begin', { policy, config: { effectThreshold: .91, evidenceThreshold: .93 } });
  sink('request', { policy, questionVersion: 'historical-status-v1', mapping: [{ id: 'r', outcomeKey: 'outcome', evidenceKey: 'evidence' }],
    payload: { model: 'offline', state: evidence, questions: { outcome: question } } });
  sink('response', { value: {}, truncated: false, bytes: 2 });
  if (options.pending) sink('assessment-status', { status: 'pending', profile: 'legacy', reason: 'not-started' });
  else complete(sink);
  if (options.permission !== null) sink('permission', { outcome: options.permission ?? 'released' });
  if (options.execution !== null) sink('execution', { outcome: options.execution ?? 'executed' });
  await writer.complete();
}

test('observe BLOCK with a recorded result has neutral Ran first on desktop and narrow screens', async () => {
  await withInspector('execution-first-preview', async ({ page }) => {
    await page.locator('.decision-summary').waitFor();
    await mkdir('coverage/inspector-artifacts', { recursive: true });
    await page.screenshot({ path: 'coverage/inspector-artifacts/status-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'coverage/inspector-artifacts/status-narrow.png' });
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls' }).click();
    await page.screenshot({ path: 'coverage/inspector-artifacts/status-narrow-calls.png' });
    expect((await page.locator('.call-state .status-chip').first().textContent())?.trim()).toBe('Ran');
    expect(await page.locator('.call-state .status-chip.neutral').count()).toBe(1);
    expect(await page.locator('.call-mode').textContent()).toBe('Observe');
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Summary' }).click();
    expect((await page.locator('.primary-badges .status-chip').first().textContent())?.trim()).toBe('Ran');
    expect(await page.locator('.primary-status').textContent()).toContain('Observe');
    expect(await page.locator('.primary-status .finding-chips .caution').textContent()).toContain('Assessment uncertainty');
    expect(await page.locator('.map-policy').textContent()).toContain('Recorded assessment');
    expect(await page.locator('.map-policy').textContent()).toContain('Would block in enforce mode');
    expect(await page.locator('.map-check.danger').count()).toBe(0);
    expect(await page.locator('.map-check.caution').count()).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }, { base: false, seed: directory => seedStatus(directory), path: link(1) });
});

for (const schema of [1, 2, 3, 4] as const) test(`schema ${schema} preserves recorded labels, scores, thresholds, questions and exact evidence`, async () => {
  await withInspector(`historical-status-${schema}`, async ({ page, app, open }) => {
    await page.locator('.decision-summary').waitFor();
    const api = `/api/sessions/${recordSessionKey(address(schema))}/invocations/${recordInvocationKey(address(schema))}`;
    const data = await (await fetch(app.origin + api)).json();
    expect(data.issues).toEqual([]);
    expect(data.view.decision).toBe('BLOCK');
    expect(data.view.permission).toBe('released');
    expect(data.view.execution).toBe('executed');
    expect(data.view.questionVersion).toBe('historical-status-v1');
    expect(data.view.rules[0].result.outcome.choice).toBe('PASS');
    expect(data.view.rules[0].result.outcome.probabilities.PASS).toBe(.88);
    expect(data.view.rules[0].thresholds).toEqual({ effectThreshold: .91, evidenceThreshold: .93 });
    expect(data.view.evidence).toEqual(evidence);
    expect((await page.locator('.call-state .status-chip').first().textContent())?.trim()).toBe('Ran');
    expect(await page.locator('.primary-badges .status-chip > span').first().textContent()).toBe('Ran');
    await reveal(page, '.why-disclosure');
    expect(await page.getByRole('meter', { name: 'Outcome confidence' }).getAttribute('aria-valuetext')).toBe('0.88; required confidence 0.91');
    await openEvidence(page);
    expect(JSON.parse((await page.locator('.evidence-section').filter({ hasText: 'state.action' }).locator('pre').textContent())!)).toEqual(evidence.action);
    await page.getByRole('tab', { name: 'Questions' }).click();
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    expect(JSON.parse((await page.locator('.question-json').first().textContent())!)).toEqual(question);
    await page.locator('.question-details summary').click();
    expect(await page.locator('.question-details').textContent()).toContain('historical-status-v1');
    const linked = await open(link(schema));
    expect(await linked.locator('.primary-badges .status-chip > span').first().textContent()).toBe('Ran');
    await linked.close();
  }, { base: false, seed: directory => seedStatus(directory, { schema }), path: link(schema) });
});

for (const [execution, permission, label] of [
  ['executed', 'blocked', 'Ran'], ['failed', 'blocked', 'Failed'],
  [null, 'blocked', 'TENET blocked'], [null, 'released', 'Released'], [null, null, 'Execution unknown'],
] as const) test(`real archive shows ${label} for ${execution}/${permission} without changing recorded decisions`, async () => {
  await withInspector(`status-${label}`, async ({ page }) => {
    await page.locator('.decision-summary').waitFor();
    expect((await page.locator('.call-state .status-chip').first().textContent())?.trim()).toBe(label);
    expect((await page.locator('.primary-badges .status-chip').first().textContent())?.trim()).toBe(label);
    expect(await page.locator('.map-verdict').textContent()).toBe('Would block in enforce mode');
    const contradiction = permission === 'blocked' && execution !== null;
    expect(await page.locator('.recording-inconsistency').count()).toBe(contradiction ? 2 : 0);
    if (contradiction) expect(await page.locator('.primary-status .recording-inconsistency').textContent()).toContain(`execution is ${execution}`);
    if (label === 'Failed') expect(await page.locator('.execution-summary').textContent()).toContain('does not prove there were no external effects');
  }, { base: false, seed: directory => seedStatus(directory, { execution, permission }), path: link(1) });
});

for (const width of [1280, 390]) test(`Observe with blocked permission keeps its counterfactual visible at ${width}px`, async () => {
  await withInspector(`observe-blocked-first-view-${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.decision-summary').waitFor();
    expect(await page.locator('.primary-badges .status-chip > span').first().textContent()).toBe('TENET blocked');
    expect(await page.locator('.primary-status').innerText()).toContain('Observe');
    expect(await page.locator('.story-assessment').isVisible()).toBe(true);
    expect(await page.locator('.story-assessment').innerText()).toBe('Would block in enforce mode');
    expect(await page.locator('.decision-map').isVisible()).toBe(false);
    expect(await page.locator('.capture-details').getAttribute('open')).toBeNull();
  }, { base: false, seed: directory => seedStatus(directory, { permission: 'blocked', execution: null }), path: link(1) });
});

for (const width of [1280, 390]) test(`polling Released to Ran at ${width}px retains selection, evidence node and scroll through delayed assessment`, async () => {
  await withInspector(`status-poll-${width}`, async ({ page, directory }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.decision-summary').waitFor();
    expect((await page.locator('.call-state .status-chip').first().textContent())?.trim()).toBe('Released');
    expect(await page.locator('.primary-badges .status-chip > span').first().textContent()).toContain('Released');
    expect(await page.locator('.map-verdict').textContent()).toBe('Decision unavailable');
    expect(await page.locator('.assessment-status').textContent()).toContain('pending');
    expect(await page.getByRole('meter').count()).toBe(0);
    await reveal(page, '.why-disclosure');
    await reveal(page, '.other-rules');
    await page.locator('.rule-row').click();
    const selectedRule = await page.locator('.rule-row[aria-pressed="true"]').textContent();
    await openEvidence(page);
    const panel = page.locator('#panel-Evidence');
    const scroll = await panel.evaluate(el => { el.dataset.retention = 'same-node'; el.scrollTop = 180; return el.scrollTop; });
    expect(scroll).toBeGreaterThan(0);
    const selectedLink = page.url();
    const writer = new FixtureArchiveWriter({ enabled: true, directory });
    const sink = bind(writer, 3);
    complete(sink);
    sink('assessment-status', { status: 'completed', profile: 'legacy' });
    sink('execution', { outcome: 'executed' });
    await writer.complete();
    await expect.poll(() => page.locator('.primary-badges .status-chip > span').first().textContent(), { timeout: 10_000 }).toBe('Ran');
    expect((await page.locator('.call-row[aria-pressed="true"] .call-state .status-chip').first().textContent())?.trim()).toBe('Ran');
    expect(await page.locator('.rule-row[aria-pressed="true"]').textContent()).toContain('Keep private data local.');
    expect(selectedRule).toContain('Keep private data local.');
    expect(await panel.getAttribute('data-retention')).toBe('same-node');
    expect(await panel.evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.getByRole('tab', { name: 'Evidence' }).getAttribute('aria-selected')).toBe('true');
    expect(page.url()).toBe(selectedLink);
    expect(await page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('ran');
  }, { base: false, seed: directory => seedStatus(directory, { schema: 3, execution: null, pending: true }), path: link(3) });
});
