import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { recordSessionKey, recordInvocationKey } from '../../../src/recording/archive.js';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';
import { openRecordedData, reveal } from '../ui-navigation.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);

type Schema = 1 | 2 | 3 | 4;
const identity = { sessionId: 'status', invocationId: 'ran', callId: 'ran',
  toolName: 'read', cwd: '/synthetic', mode: 'observe' as const };
const address = (schemaVersion: Schema) => ({ ...identity, schemaVersion, host: 'pi', contextId: 'main' });
const link = (schema: Schema) => `/?session=${recordSessionKey(address(schema))}&invocation=${recordInvocationKey(address(schema))}`;
const bind = (writer: FixtureArchiveWriter, schema: Schema) => schema === 1 ? writer.bindHistorical(identity, 1)
  : schema === 4 ? writer.bindHistorical(address(schema), 4) : schema === 2 ? writer.bindHistorical(address(schema), 2) : writer.bindHistorical(address(schema), 3);
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
    expect((await page.locator('[data-list-fact="result"] .status-chip').first().textContent())?.trim()).toBe('Successful');
    expect(await page.locator('[data-list-fact="result"] .status-chip.neutral').count()).toBe(1);
    expect(await page.locator('.displayed-context').textContent()).toContain('Displayed calls: Observe mode. Not blocked by Tenet.');
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Selected call' }).click();
    expect((await page.locator('[data-fact="result"]').first().textContent())?.trim()).toBe('Successful');
    expect(await page.locator('.primary-status').textContent()).toContain('Observe');
    expect(await page.locator('[data-fact="findings"] .caution').textContent()).toContain('Assessment uncertainty');
    await openRecordedData(page, 'Questions');
    const recorded = JSON.parse((await page.locator('.exact-rule-data pre').textContent())!);
    expect(recorded.rules[0].builtin).toBe(false);
    expect(await page.locator('[data-fact="assessment"]').textContent()).toContain('Would block in enforce mode');
    expect(recorded.rules[0].gateIds).toEqual(['outcome-confidence-below-threshold', 'evidence-confidence-below-threshold']);
    expect(await page.locator('.rule-question-link, .rule-outcome, .recorded-rule-facts').count()).toBe(0);
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
    expect((await page.locator('[data-list-fact="result"] .status-chip').first().textContent())?.trim()).toBe('Successful');
    expect(await page.locator('[data-fact="result"]').first().textContent()).toBe('Successful');
    expect(await page.locator('.rule-question-link, .rule-outcome, .recorded-rule-facts').count()).toBe(0);
    await openRecordedData(page);
    expect(JSON.parse((await page.locator('.evidence-section').filter({ hasText: 'state.action' }).locator('pre').textContent())!)).toEqual(evidence.action);
    await openRecordedData(page, 'Questions');
    const exact = JSON.parse((await page.locator('.exact-rule-data pre').textContent())!);
    expect(exact).toEqual({ questionVersion: data.view.questionVersion, rules: data.view.rules });
    expect(exact.rules[0].questions.outcome).toEqual(question);
    const linked = await open(link(schema));
    expect(await linked.locator('[data-fact="result"]').first().textContent()).toBe('Successful');
    await linked.close();
  }, { base: false, seed: directory => seedStatus(directory, { schema }), path: link(schema) });
});

for (const [execution, permission] of [
  ['executed', 'blocked'], ['failed', 'blocked'],
  [null, 'blocked'], [null, 'released'], [null, null],
] as const) test(`real archive preserves permission/result for ${execution}/${permission}`, async () => {
  await withInspector('separate-facts', async ({ page }) => {
    await page.locator('.decision-summary').waitFor();
    const result = execution === 'executed' ? 'Successful' : execution === 'failed' ? 'Failed' : 'Unknown / not recorded';
    const permissionLabel = permission === 'blocked' ? 'Blocked by Tenet' : permission === 'released' ? 'Not blocked by Tenet' : 'Unknown';
    expect(await page.locator('[data-fact="result"]').textContent()).toBe(result);
    expect(await page.locator('[data-fact="permission"]').textContent()).toBe(permissionLabel);
    if (permission === 'released' && execution === null) {
      expect(await page.locator('.displayed-context').textContent()).toContain('No tool results recorded.');
      expect(await page.locator('[data-list-fact]').count()).toBe(0);
    } else {
      expect((await page.locator('[data-list-fact="result"]').textContent())?.trim()).toBe(result);
      expect((await page.locator('[data-list-fact="permission"]').textContent())?.trim()).toBe(permissionLabel);
    }
    expect(await page.locator('[data-fact="assessment"]').textContent()).toBe('Would block in enforce mode');
    const contradiction = permission === 'blocked' && execution !== null;
    expect(await page.locator('.recording-inconsistency').count()).toBe(contradiction ? 2 : 0);
    if (contradiction) expect(await page.locator('.primary-status .recording-inconsistency').textContent()).toContain(`execution is ${execution}`);
    if (execution === 'failed') expect(await page.locator('.summary-note').textContent()).toContain('does not prove there were no external effects');
  }, { base: false, seed: directory => seedStatus(directory, { execution, permission }), path: link(1) });
});

for (const width of [1280, 390]) test(`Observe with blocked permission keeps its counterfactual visible at ${width}px`, async () => {
  await withInspector(`observe-blocked-first-view-${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.decision-summary').waitFor();
    expect(await page.locator('[data-fact="permission"]').textContent()).toBe('Blocked by Tenet');
    expect(await page.locator('.primary-status').innerText()).toContain('Observe');
    expect(await page.locator('[data-fact="assessment"]').isVisible()).toBe(true);
    expect(await page.locator('[data-fact="assessment"]').innerText()).toBe('Would block in enforce mode');
    expect(await page.locator('.decision-map').count()).toBe(0);
    expect(await page.locator('.recording-details').getAttribute('open')).toBeNull();
  }, { base: false, seed: directory => seedStatus(directory, { permission: 'blocked', execution: null }), path: link(1) });
});

for (const width of [1280, 390]) test(`polling Released to Ran at ${width}px retains selection, evidence node and scroll through delayed assessment`, async () => {
  await withInspector(`status-poll-${width}`, async ({ page, directory }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.decision-summary').waitFor();
    expect((await page.locator('[data-list-fact="permission"] .status-chip').first().textContent())?.trim()).toBe('Not blocked by Tenet');
    expect(await page.locator('[data-fact="permission"]').textContent()).toBe('Not blocked by Tenet');
    expect(await page.locator('[data-fact="assessment"]').textContent()).toBe('Pending');
    expect(await page.locator('[data-fact="assessment"]').textContent()).toBe('Pending');
    expect(await page.getByRole('meter').count()).toBe(0);
    expect(await page.locator('.rule-question-link, .rule-outcome').count()).toBe(0);
    const selectedRule = JSON.parse((await page.locator('.exact-rule-data pre').textContent())!).rules[0].text;
    await page.locator('.why-disclosure > summary').click();
    const ruleNode = page.locator('.rule-detail').first();
    await ruleNode.evaluate(el => { (el as HTMLElement).dataset.retained = 'delayed-rule'; });
    await openRecordedData(page);
    const panel = page.locator('.submitted-evidence');
    const scroll = await panel.evaluate(el => { el.dataset.retention = 'same-node'; el.scrollTop = 180; return el.scrollTop; });
    expect(scroll).toBeGreaterThan(0);
    const selectedLink = page.url();
    const writer = new FixtureArchiveWriter({ enabled: true, directory });
    const sink = bind(writer, 3);
    complete(sink);
    sink('assessment-status', { status: 'completed', profile: 'legacy' });
    sink('execution', { outcome: 'executed' });
    await writer.complete();
    await expect.poll(() => page.locator('[data-fact="result"]').first().textContent(), { timeout: 10_000 }).toBe('Successful');
    expect((await page.locator('.call-row[aria-pressed="true"] [data-list-fact="result"] .status-chip').first().textContent())?.trim()).toBe('Successful');
    expect(JSON.parse((await page.locator('.exact-rule-data pre').textContent())!).rules[0].text).toBe('Keep private data local.');
    expect(selectedRule).toContain('Keep private data local.');
    expect(await ruleNode.getAttribute('data-retained')).toBe('delayed-rule');
    expect(await page.locator('.why-disclosure').getAttribute('open')).not.toBeNull();
    expect(await panel.getAttribute('data-retention')).toBe('same-node');
    expect(await panel.evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.locator('.submitted-evidence-details').getAttribute('open')).not.toBeNull();
    expect(page.url()).toBe(selectedLink);
    expect(await page.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('ran');
  }, { base: false, seed: directory => seedStatus(directory, { schema: 3, execution: null, pending: true }), path: link(3) });
});
