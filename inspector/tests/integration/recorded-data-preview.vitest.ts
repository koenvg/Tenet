import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';
import { recordedDataLink, seedRecordedData } from './recorded-data-fixture.js';
beforeAll(launchBrowser);
afterAll(closeBrowser);
test('fictional Recorded data is readable on desktop and mobile, with all rule questions', async () => {
  await withInspector('recorded-data-preview', async ({ page }) => {
    await page.locator('.recorded-disclosure > summary').click();
    await page.locator('.submitted-fields').waitFor();
    await mkdir('coverage/inspector-artifacts', { recursive: true });
    for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.locator('[aria-label="Submitted action"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `coverage/inspector-artifacts/tenet-60-${name}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.exact-rules > summary').click();
      await page.locator('.exact-rules').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `coverage/inspector-artifacts/exact-records-${name}.png` });
      const captured = JSON.parse((await page.locator('.exact-rule-data pre').textContent())!);
      expect(captured.rules.map((rule: { id: string }) => rule.id)).toContain('local');
      expect(captured.rules.every((rule: { questions: { outcome: unknown; evidence: unknown } }) => rule.questions.outcome && rule.questions.evidence)).toBe(true);
      expect(await page.locator('.rule-questions, .answer-choices, .question-rich').count()).toBe(0);
      await page.locator('.exact-rules > summary').click();
    }
  }, { base: false, seed: seedRecordedData, path: recordedDataLink() });
});


test('delayed request and result preserve native disclosure state, focus, evidence node and URL through real polls', async () => {
  await withInspector('recorded-data-delayed', async ({ page, directory }) => {
    await page.locator('.recorded-disclosure > summary').click();
    await page.locator('.submitted-evidence-details > summary').click();
    const questions = page.locator('.exact-rules');
    await questions.locator(':scope > summary').click();
    const exact = page.locator('.exact-rule-data');
    await exact.focus();
    const url = page.url();
    await exact.evaluate(el => el.dataset.retention = 'same-exact-node');
    const evidence = page.locator('.submitted-evidence');
    await evidence.evaluate(el => el.dataset.retention = 'same-evidence-node');
    let polls = 0;
    page.on('response', response => { if (response.url().includes('/invocations/')) polls++; });
    await expect.poll(() => polls, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('exact-rule-data');
    await seedRecordedData(directory);
    await expect.poll(() => page.locator('.submitted-fields').count(), { timeout: 10000 }).toBe(1);
    expect(await exact.getAttribute('data-retention')).toBe('same-exact-node');
    expect(await evidence.getAttribute('data-retention')).toBe('same-evidence-node');
    expect(await questions.getAttribute('open')).not.toBeNull();
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('exact-rule-data');
    const captured = JSON.parse((await exact.locator('pre').textContent())!);
    expect(captured.rules.every((rule: { questions: unknown }) => rule.questions !== null)).toBe(true);
    const exactScroll = await exact.evaluate(el => { el.scrollTop = 83; return el.scrollTop; });
    expect(exactScroll).toBe(83);
    const scroll = await evidence.evaluate(el => { el.scrollTop = 37; return el.scrollTop; });
    expect(scroll).toBe(37);
    const { FixtureArchiveWriter } = await import('../../../test/archive-fixture.js');
    const writer = new FixtureArchiveWriter({ enabled: true, directory });
    writer.bindHistorical({ host: 'pi', contextId: 'main', sessionId: 'fictional-recorded-data', invocationId: 'submitted-edit', callId: 'submitted-edit', toolName: 'edit', cwd: '/fictional-recorded-data', mode: 'observe' }, 4)('execution', { outcome: 'executed' });
    await writer.complete();
    await expect.poll(() => page.locator('[data-fact="result"]').textContent(), { timeout: 10000 }).toBe('Successful');
    expect(await evidence.evaluate(el => el.scrollTop)).toBe(scroll);
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('exact-rule-data');
    expect(await exact.evaluate(el => el.scrollTop)).toBe(exactScroll);
    expect(await exact.getAttribute('data-retention')).toBe('same-exact-node');
    expect(page.url()).toBe(url);
  }, { base: false, path: recordedDataLink(), seed: async directory => {
    const { FixtureArchiveWriter } = await import('../../../test/archive-fixture.js');
    const writer = new FixtureArchiveWriter({ enabled: true, directory });
    writer.bindHistorical({ host: 'pi', contextId: 'main', sessionId: 'fictional-recorded-data', invocationId: 'submitted-edit', callId: 'submitted-edit', toolName: 'edit', cwd: '/fictional-recorded-data', mode: 'observe' }, 4)('begin', {
      policy: { rules: [{ id: 'local', text: 'Keep fictional customer data local.', line: 1, enforcement: 'BLOCK' }, { id: 'approval', text: 'Confirm publication with the owner.', line: 2, enforcement: 'BLOCK' }] },
    });
    await writer.complete();
  } });
});


test('supported historical captures with lone-surrogate invocation and rule IDs remain inspectable', async () => {
  const { FixtureArchiveWriter } = await import('../../../test/archive-fixture.js');
  const { recordSessionKey, recordInvocationKey } = await import('../../../src/recording/archive.js');
  const identity = { schemaVersion: 1 as const, sessionId: 'fictional-surrogates', invocationId: 'fictional-\ud800', callId: 'fictional-call', toolName: 'edit', cwd: '/fictional', mode: 'observe' as const };
  const path = `/?session=${recordSessionKey(identity)}&invocation=${recordInvocationKey(identity)}`;
  await withInspector('recorded-surrogates', async ({ page, app }) => {
    const response = await fetch(`${app.origin}/api/sessions/${recordSessionKey(identity)}/invocations/${recordInvocationKey(identity)}`);
    expect(response.status).toBe(200);
    const captured = await response.json();
    expect(captured.issues).toEqual([]);
    expect(captured.view.identity.invocationId).toBe(identity.invocationId);
    await page.locator('.invocation').waitFor();
    expect(await page.locator('.decision-summary').isVisible()).toBe(true);
    await page.locator('.recorded-disclosure > summary').click();
    await page.locator('.exact-rules > summary').click();
    const exact = JSON.parse((await page.locator('.exact-rule-data pre').textContent())!);
    const ids = exact.rules.map((rule: { id: string }) => rule.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(captured.view.rules.map((rule: { id: string }) => rule.id));
    expect(exact.rules[1].questions.outcome.instructions).toBe('Captured question for rule 2');
    await page.locator('.recording-details > summary').click();
    await page.locator('.record-identifiers > summary').click();
    expect(await page.getByLabel('Recorded invocation ID', { exact: true }).inputValue()).toBe(identity.invocationId);
  }, { base: false, path, seed: async directory => {
    const writer = new FixtureArchiveWriter({ enabled: true, directory });
    const sink = writer.bindHistorical(identity, 1);
    const policy = { rules: ['rule-\ud800', 'rule-\ud801', 'rule-\ufffd'].map((id, index) => ({ id, line: index + 1, text: `Fictional rule ${index + 1}`, enforcement: 'BLOCK' })) };
    sink('begin', { policy });
    sink('request', { policy, questionVersion: 'fictional-id-test', mapping: policy.rules.map(rule => ({ id: rule.id, outcomeKey: rule.id, evidenceKey: `${rule.id}-evidence`, reference: 'state.policy' })), payload: {
      model: 'offline', state: { action: { arguments: {} }, policy, context: {}, trajectory: {}, integrity: {} }, questions: Object.fromEntries(policy.rules.map((rule, index) => [rule.id, { instructions: `Captured question for rule ${index + 1}`, criteria: { PASS: 'Fictional pass.' } }])),
    } });
    sink('permission', { outcome: 'released' });
    await writer.complete();
  } });
});
