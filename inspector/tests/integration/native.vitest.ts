import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { ArchiveWriter, recordSessionKey, recordInvocationKey } from '../../../src/recording/archive.js';
import { createApusJudge } from '../../../src/decision/apus.js';
import { decide } from '../../../src/decision/decide.js';
import { captureAction } from '../../../src/decision/evidence.js';
import { policy } from '../../../test/helpers.js';
import { APUS_MODEL, scriptedNative } from '../../../test/apus-scripted.js';
import { closeBrowser, launchBrowser, withInspector } from './fixture.js';
import { reveal, openRecordedData } from '../ui-navigation.js';

beforeAll(launchBrowser);
afterAll(closeBrowser);
const identity = { schemaVersion: 4, host: 'offline', contextId: 'main', sessionId: 'native-history', invocationId: 'c', callId: 'c', toolName: 'inert-fixture', cwd: '/synthetic', mode: 'observe' as const };
const link = `/?session=${recordSessionKey(identity)}&invocation=${recordInvocationKey(identity)}`;
async function seed(directory: string, partial: boolean) {
  const writer = new ArchiveWriter({ enabled: true, directory });
  const sink = writer.bind(identity);
  let scores = 0;
  const fake = scriptedNative({ mutate: (v, c) => partial && c.path === '/completion' && ++scores === 2 ? new Response('private-error-canary', { status: 503 }) : v });
  sink('begin', { policy, requestedProvider: 'apus-llamacpp', requestedModel: APUS_MODEL, integrity: { id: 'integrity', text: 'Recorded integrity' } });
  const result = await decide({ policy, cwd: identity.cwd,
    action: captureAction({ sessionId: identity.sessionId, callId: 'c', toolName: 'inert-fixture', arguments: { text: '<script>window.nativeHostile = true</script>' } }),
    config: { deadlineMs: 5000 }, judgeIdentity: { provider: 'apus-llamacpp', requestedModel: APUS_MODEL },
    judge: createApusJudge({ baseUrl: 'http://127.0.0.1:8088', model: APUS_MODEL, fetch: fake.fetch }), recording: sink });
  sink('assessment', result as any);
  sink('decision', result as any);
  sink('assessment-status', { status: partial ? 'unavailable' : 'completed', profile: result.profile, reason: result.reason });
  sink('permission', { outcome: 'released' });
  await writer.close();
  expect(writer.health().failed + writer.health().dropped + writer.health().pending).toBe(0);
}

for (const width of [1280, 390]) for (const partial of [false, true]) test(`built inspector reads ${partial ? 'partial' : 'complete'} native history at ${width}px without inferring identity or execution`, async () => {
  await withInspector(`apus-${partial}-${width}`, async ({ page, app }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.decision-summary').waitFor();
    await reveal(page, '.recorded-disclosure');
    await reveal(page, '.recording-details');
    expect(await page.locator('.recording-details').innerText()).toContain('apus-llamacpp experimental');
    expect(await page.locator('.recording-details').innerText()).toContain('apus-recording-v1');
    expect(await page.locator('.recording-details').innerText()).toContain('llamacpp-b11118-choice-v1');
    expect(await page.locator('.recording-details').innerText()).toContain(partial ? 'not recorded; no complete returned assessment' : APUS_MODEL);
    await page.getByText('Native scoring mappings', { exact: true }).click();
    const mappings = page.locator('.native-mappings');
    expect(await mappings.innerText()).toContain(partial ? '2 scoring requests; 1 captured responses' : '4 scoring requests; 4 captured responses');
    if (!partial) expect(await mappings.innerText()).toContain('rule_0_facts: deterministic NONE');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('/tmp/tenet-70/screenshots', { recursive: true });
    await mappings.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/tenet-70/screenshots/native-${partial}-${width}.png` });
    await openRecordedData(page, 'Questions');
    const exact = JSON.parse((await page.locator('.exact-rule-data pre').textContent())!);
    const address = new URL(page.url()).searchParams;
    const captured = await (await fetch(`${app.origin}/api/sessions/${address.get('session')}/invocations/${address.get('invocation')}`)).json();
    expect(exact).toEqual({ questionVersion: captured.view.questionVersion, rules: captured.view.rules });
    expect(exact.rules[0].questions.evidence.criteria).toHaveProperty('SUFFICIENT');
    expect(await page.locator('.question-rich, .rich-markdown').count()).toBe(0);
    await reveal(page, '.recorded-response');
    await page.getByText('Recorded native exchanges', { exact: true }).click();
    const exchanges = page.locator('.native-exchanges');
    expect(await exchanges.locator('details').count()).toBe(partial ? 4 : 11);
    await exchanges.locator('details').first().locator('summary').click();
    expect(await exchanges.locator('details').first().innerText()).toContain('omittedFields');
    expect(await page.evaluate(() => (window as any).nativeHostile)).toBeUndefined();
    expect(await page.locator('script').evaluateAll(elements => elements.some(e => e.textContent?.includes('nativeHostile')))).toBe(false);
    expect(await page.locator('.primary-status').innerText()).toContain('Unknown / not recorded');
  }, { base: false, seed: directory => seed(directory, partial), path: link });
});
