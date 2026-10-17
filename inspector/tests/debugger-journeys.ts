import { expect, openDebugger, type createDebuggerTest } from './debugger-fixture.js';
import type { Page } from 'playwright';
import { join, resolve } from 'node:path';
import { recordedQuestion } from './browser-fixture.js';
import { openRecordedData, reveal } from './ui-navigation.js';
import { qualifiedSessionKey } from '../../src/recording/archive.js';
const artifacts = resolve('coverage/inspector-artifacts/playwright');
async function pickCall(p: Page, id: string, recorded = true) {
  const session = qualifiedSessionKey('pi', 's', 'main'), origin = new URL(p.url()).origin;
  const data = await (await p.request.get(`${origin}/api/sessions/${session}?limit=100`)).json();
  const row = data.invocations.find((item: { callId: string }) => item.callId === id);
  expect(row?.id).toMatch(/^[a-f0-9]{64}$/);
  await p.goto(`${origin}/?session=${session}&invocation=${row.id}`);
  await p.locator('.decision-summary').waitFor();
  expect(await p.locator('.decision-title h2 span').textContent()).toBe(id);
  if (recorded) { await reveal(p, '.recorded-disclosure'); await reveal(p, '.recording-details'); }
}
function watchCaptureWarnings() {
  const main = document.querySelector('main.rule-main')!;
  const warning = 'Capture may be incomplete.';
  let seen = main.textContent?.includes(warning) ?? false;
  const inspect = (records: MutationRecord[]) => {
    seen ||= main.textContent?.includes(warning) ?? false;
    for (const record of records) {
      seen ||= !!record.oldValue?.includes(warning)
        || !!record.target.textContent?.includes(warning)
        || [...record.addedNodes, ...record.removedNodes].some(node => node.textContent?.includes(warning));
    }
  };
  const observer = new MutationObserver(inspect);
  observer.observe(main, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
  return { stop() { inspect(observer.takeRecords()); observer.disconnect(); return seen; } };
}
export function registerDebuggerJourneys(test: ReturnType<typeof createDebuggerTest>) {
  test('initial archive selection can outlast the semantic poll deadline', async ({ debuggerRun }) => {
    const p = debuggerRun.page;
    let delayed = false;
    await p.route(/\/api\/sessions(?:\?|$)/, async route => {
      if (!delayed) {
        delayed = true;
        // Delay discovery beyond the one-second semantic poll deadline.
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      await route.fallback();
    });
    await openDebugger(p, debuggerRun.app.origin);
    expect(delayed).toBe(true);
    expect(await p.locator('.rule-trigger').count()).toBeGreaterThan(0);
    expect(await p.locator('.invocation').count()).toBe(0);
  });
  for (const width of [1280, 390]) test(`default story and keyboard disclosures at ${width}px`, async ({ debuggerRun }) => {
    const p = debuggerRun.page; await p.setViewportSize({ width, height: 844 });
    await pickCall(p, 'summary', false);
    await p.locator('.story-action').waitFor();
    expect(await p.locator('.primary-status').innerText()).toContain('Successful');
    expect(await p.locator('.primary-status').innerText()).toContain('Observe');
    expect(await p.locator('[data-fact="assessment"]').innerText()).toBe('Would block in enforce mode');
    expect(await p.locator('.decision-map').count()).toBe(0);
    expect(await p.locator('.recorded-data').isVisible()).toBe(false);
    expect(await p.locator('.lifecycle').isVisible()).toBe(false);
    expect(await p.locator('.summary-content > details > summary').allTextContents()).toEqual(['Why this assessment', 'Recorded data']);
    expect(await p.locator('.rule-question-link, .rule-questions, .rule-outcome, .recorded-rule-facts').count()).toBe(0);
    await p.locator('.recorded-disclosure > summary').press('Enter');
    await p.locator('.exact-rules > summary').press('Enter');
    expect(await p.locator('.exact-rules').getAttribute('open')).not.toBeNull();
    expect(await p.locator('.recorded-disclosure').getAttribute('open')).not.toBeNull();
    await p.locator('.recorded-disclosure > summary').press('Enter');
    expect(await p.locator('.recorded-disclosure').getAttribute('open')).toBeNull();
    await p.locator('.recorded-disclosure > summary').press('Enter');
    expect(await p.locator('.recorded-disclosure').getAttribute('open')).not.toBeNull();
    await p.locator('.recording-details > summary').press('Enter');
    expect(await p.locator('.lifecycle').isVisible()).toBe(true);
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('background refresh does not flash archive-wide warnings into the selected session', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'summary');
    let completedPolls = 0;
    const rulesURL = new URL(`/api/sessions/${new URL(p.url()).searchParams.get('session')}/rules`, debuggerRun.app.origin);
    p.on('response', async response => {
      const url = new URL(response.url());
      if (url.origin === rulesURL.origin && url.pathname === rulesURL.pathname && response.status() === 200 && await response.finished() === null) completedPolls++;
    });
    expect(await p.locator('.decision-summary').isVisible()).toBe(true);
    const before = await p.locator('.decision-summary').boundingBox();
    const mutations = await p.evaluate(() => new Promise<number>(resolve => {
      let count = 0;
      const observer = new MutationObserver(records => count += records.length);
      observer.observe(document.querySelector('main')!, { subtree: true, childList: true, attributes: true, characterData: true });
      setTimeout(() => { observer.disconnect(); resolve(count); }, 4500);
    }));
    expect(completedPolls).toBeGreaterThanOrEqual(2);
    expect(mutations).toBe(0);
    expect(await p.locator('.decision-summary').boundingBox()).toEqual(before);
    expect(await p.locator('.recording-issues').count()).toBe(1);
    expect(await p.locator('.issues-body').textContent()).not.toContain('Capture may be incomplete.');
    expect(debuggerRun.pageErrors).toEqual([]);
  });

  test('native session picker and archive project input stay stable during polling', async ({ debuggerRun }) => {
    const p = debuggerRun.page;
    await p.locator('.rule-session-toggle').click();
    await expect.poll(() => p.locator('#rule-session-menu').evaluate(el => el.matches(':popover-open'))).toBe(true);
    await p.waitForResponse(response => response.url().includes('/api/sessions?'));
    expect(await p.locator('#rule-session-menu').evaluate(el => el.matches(':popover-open'))).toBe(true);
    await p.keyboard.press('Escape');
    await reveal(p, '.recording-issues');
    const filter = p.getByRole('textbox', { name: 'Project directory' }); await filter.fill('/historical');
    await p.waitForResponse(response => response.url().includes('/api/sessions?'));
    expect(await filter.inputValue()).toBe('/historical');
    await p.getByRole('button', { name: 'Filter projects' }).click();
    await p.locator('.rule-session-toggle').click();
    await expect.poll(() => p.getByRole('radio').count()).toBe(1);
    await p.getByRole('radio').click();
    expect(await p.locator('#rule-session-menu').evaluate(el => el.matches(':popover-open'))).toBe(false);
    expect(debuggerRun.pageErrors).toEqual([]);
  });

  test('native panel content scrolls independently of the locked rules page', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await p.setViewportSize({ width: 1440, height: 700 }); await pickCall(p, 'summary');
    const background = await p.evaluate(() => scrollY), body = p.locator('.rule-panel-body');
    await body.hover(); await p.mouse.wheel(0, 1000);
    await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await p.evaluate(() => scrollY)).toBe(background);
    expect(await p.locator('.decision-title h2 span').textContent()).toBe('summary');
    expect(await p.locator('.rule-panel-header').isVisible()).toBe(true);
  });

  test('exact records are keyboard accessible and reduced motion stays static', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'summary');
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.locator('.exact-rules > summary').press('Enter');
    expect(await p.locator('.exact-rules').getAttribute('open')).not.toBeNull();
    await p.keyboard.press('Tab');
    expect(await p.evaluate(() => document.activeElement?.className)).toBe('exact-rule-data');
    expect(await p.locator('.exact-rule-data').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await p.locator('.primary-status .map-connections').count()).toBe(0);
  });

  test('native modal replaces resizers and traps keyboard focus until dismissed', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'low-pass');
    expect(await p.locator('input[type="range"], .pane-resizer').count()).toBe(0);
    expect(await p.getByRole('separator').count()).toBe(0);
    await p.getByRole('button', { name: 'Close', exact: true }).focus();
    await p.keyboard.press('Shift+Tab');
    expect(await p.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
    await p.keyboard.press('Escape');
    expect(await p.locator('dialog[open]').count()).toBe(0);
    expect(await p.locator('.rule-session-toggle').evaluate(el => document.activeElement === el)).toBe(true);
    expect(debuggerRun.pageErrors).toEqual([]);
  });

  test('Ran is neutral and finding tones are separate while exact recorded choices remain separate', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'summary');
    const ran = p.locator('[data-fact="result"]').first();
    expect((await ran.textContent())?.trim()).toBe('Successful');
    expect(await ran.evaluate(el => getComputedStyle(el).color)).toBe('rgb(35, 37, 34)');
    expect(await ran.locator('svg[aria-hidden="true"]').count()).toBe(0);
    for (const [id, state, color, background] of [
      ['summary', 'caution', 'rgb(121, 86, 23)', 'rgb(252, 242, 222)'],
      ['integrity', 'danger', 'rgb(190, 55, 55)', 'rgb(251, 236, 235)'],
      ['approval', 'approval', 'rgb(98, 65, 154)', 'rgb(240, 234, 251)'],
    ] as const) {
      await pickCall(p, id);
      const badge = p.locator(`[data-fact="findings"] .${state}`).first();
      expect(await badge.evaluate(el => getComputedStyle(el).color)).toBe(color);
      expect(await badge.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      expect(await badge.locator('svg[aria-hidden="true"]').count()).toBe(0);
      expect(await p.locator('.call-row').count()).toBe(0);
      expect(await p.locator('[data-fact="findings"]').textContent()).not.toBe('');
    }
    await pickCall(p, 'low-pass');
    await openRecordedData(p, 'Questions');
    const pass = JSON.parse((await p.locator('.exact-rule-data pre').textContent())!).rules[0];
    expect(pass.result.outcome.choice).toBe('PASS');
    expect(pass.result.outcome.probabilities.PASS).toBe(.88);
    expect(pass.gateIds).toContain('outcome-confidence-below-threshold');
    expect(await p.locator('.decision-explanation').textContent()).toContain('PASS selected at 0.88');
    for (const [id, choice] of [['unknown', 'UNKNOWN'], ['approval', 'APPROVAL_REQUIRED'], ['integrity', 'FAIL']]) {
      await pickCall(p, id!); await openRecordedData(p, 'Questions');
      const rule = JSON.parse((await p.locator('.exact-rule-data pre').textContent())!).rules.find((rule: { builtin: boolean }) => rule.builtin === (id === 'integrity'));
      expect(rule.result.outcome.choice).toBe(choice);
    }
  });

  test('exact records distinguish confidence, evidence, advice, approval and integrity without deriving gates', async ({ debuggerRun }) => {
    const p = debuggerRun.page;
    for (const [id, gate] of [
      ['low-pass', 'outcome-confidence-below-threshold'], ['unknown', 'outcome-unknown'],
      ['approval', null], ['evidence', 'evidence-insufficient'],
      ['evidence-confidence', 'evidence-confidence-below-threshold'], ['warn', 'rule-fail'], ['integrity', 'rule-fail'],
    ]) {
      await pickCall(p, id!); await openRecordedData(p, 'Questions');
      const records = JSON.parse((await p.locator('.exact-rule-data pre').textContent())!);
      const rule = records.rules.find((rule: { builtin: boolean; enforcement: string }) => id === 'warn' ? rule.enforcement === 'WARN' : rule.builtin === (id === 'integrity'));
      if (gate === null) { expect(rule.gateIds).toEqual([]); expect(rule.contribution).toBe('approval-required'); }
      else expect(rule.gateIds).toContain(gate);
      expect(rule.thresholds.effectThreshold).toBe(.9);
      expect(rule.thresholds.evidenceThreshold).toBe(rule.evidenceGate === 'not-applicable' ? null : .9);
      expect(rule.mapping.outcomeKey).toContain('rule_');
      if (id === 'warn') expect(rule.enforcement).toBe('WARN');
      expect(rule.builtin).toBe(id === 'integrity');
      expect(await p.locator('.exact-rules').textContent()).toContain('WARN is advisory');
      await openRecordedData(p);
      expect(await p.evaluate(() => document.activeElement?.className)).toBe('submitted-evidence');
      expect(await p.locator('.submitted-evidence').textContent()).toContain('window.hostile');
      expect(await p.locator('main img, main script').count()).toBe(0);
      expect(await p.locator('body').textContent()).not.toContain('Changed current policy');
    }
    await pickCall(p, 'summary');
    expect((await p.locator('[data-fact="result"]').first().textContent())?.trim()).toBe('Successful');
    expect(debuggerRun.externalRequests).toEqual([]); expect(debuggerRun.pageErrors).toEqual([]);
  });

  test('captured questions retain exact Markdown and hostile strings as inert JSON', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'rich'); await openRecordedData(p, 'Questions');
    const questions = p.locator('.exact-rules');
    const captured = JSON.parse((await questions.locator('pre').textContent())!);
    expect(captured.questionVersion).toBe('historical-test-v1');
    expect(captured.rules[0].mapping.reference).toBe('state.policy.rules[0].text');
    expect(captured.rules[0].questions.outcome).toEqual(recordedQuestion);
    expect(Object.keys(captured.rules[0].questions.outcome.criteria)).toEqual(['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED']);
    expect(await questions.locator('script, img, iframe, a, object').count()).toBe(0);
    expect(await p.evaluate(() => (window as Window & { hostile?: boolean }).hostile)).toBeUndefined();
    expect(await questions.locator('.rich-markdown, .question-rich, .answer-choices').count()).toBe(0);
    expect(debuggerRun.externalRequests).toEqual([]); expect(debuggerRun.pageErrors).toEqual([]);
  });

  test('evidence scroll survives opening exact records and adjacent disclosures', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await p.setViewportSize({ width: 1280, height: 700 }); await pickCall(p, 'low-pass');
    await openRecordedData(p);
    const evidence = p.locator('.submitted-evidence');
    const scroll = await evidence.evaluate(el => { el.scrollTop = 180; return el.scrollTop; });
    expect(scroll).toBeGreaterThan(0);
    await openRecordedData(p, 'Questions');
    const exact = p.locator('.exact-rule-data');
    await exact.evaluate(el => { el.dataset.retained = 'same-exact-node'; });
    const captured = JSON.parse((await exact.locator('pre').textContent())!);
    expect(captured.rules.some((rule: { mapping: { outcomeKey: string } }) => rule.mapping.outcomeKey === 'rule_1_outcome')).toBe(true);
    await p.locator('.recorded-response > summary').press('Enter');
    expect(await p.locator('[aria-label="Response"]').isVisible()).toBe(true);
    await p.locator('.exact-policy > summary').press('Enter');
    expect(await p.locator('.exact-policy pre').isVisible()).toBe(true);
    expect(await exact.getAttribute('data-retained')).toBe('same-exact-node');
    await openRecordedData(p);
    expect(await evidence.evaluate(el => el.scrollTop)).toBe(scroll);
  });

  async function expectBoundedSummary(p: Page) {
    expect(await p.locator('.decision-map').count()).toBe(0);
    expect(await p.locator('.invocation').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const rules = await p.locator('.primary-status, .recorded-disclosure').evaluateAll(nodes => nodes.map(node => {
      const bounds = node.getBoundingClientRect(), parent = node.parentElement!.getBoundingClientRect();
      return bounds.left >= parent.left && bounds.right <= parent.right + 1;
    }));
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every(Boolean)).toBe(true);
  }

  test('panel and exact records remain bounded at intermediate widths', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'summary');
    for (const width of [901, 1024, 1100, 1280]) {
      await p.setViewportSize({ width, height: 900 });
      const panel = (await p.locator('.rule-panel').boundingBox())!;
      expect(panel.x + panel.width).toBe(width); expect(panel.width).toBe(620);
      await expectBoundedSummary(p);
    }
  });

  test('mobile views retain selection, hide drag handles and avoid horizontal overflow', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'rich');
    for (const width of [390, 320, 768]) {
      await p.setViewportSize({ width, height: 844 });
      expect(await p.getByRole('separator').count()).toBe(0);
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expectBoundedSummary(p);
      await openRecordedData(p, 'Questions');
      await p.locator('.exact-rule-data').waitFor({ state: 'visible' });
      expect(await p.evaluate(() => document.activeElement?.className)).toBe('exact-rule-data');
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await p.locator('.recorded-disclosure > summary').click();
      await p.locator('.recorded-disclosure > summary').click();
      await p.getByRole('region', { name: 'Exact rule records and captured questions', exact: true }).waitFor({ state: 'visible' });
      expect(await p.locator('.decision-title h2 span').textContent()).toBe('rich');
    }
  });

  test('missing evidence is explicit and archive errors recover without a fake pass', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'missing');
    expect(await p.locator('.decision-explanation').textContent()).toContain('timeout');
    const missing = JSON.parse((await p.locator('.exact-rule-data pre').textContent())!).rules[0];
    expect(missing.gateIds).toBeNull(); expect(missing.result).toBeNull();
    expect(await p.locator('.submitted-evidence').textContent()).toContain('Submitted evidence unavailable');
    expect(await p.locator('.lifecycle').textContent()).toContain('unknown');
    await p.route('**/api/sessions?*', route => route.fulfill({ status: 503, body: '{}' }));
    await p.getByRole('button', { name: 'Close', exact: true }).click(); await reveal(p, '.recording-issues');
    await p.getByRole('button', { name: 'Refresh archive', exact: true }).click();
    await p.getByRole('alert').waitFor();
    expect(await p.getByRole('alert').textContent()).toContain('503');
    await p.unroute('**/api/sessions?*');
    await p.getByRole('button', { name: 'Refresh archive', exact: true }).click();
    await p.getByRole('alert').waitFor({ state: 'hidden' });
    await pickCall(p, 'missing');
    await p.getByRole('region', { name: 'Decision summary', exact: true }).waitFor();
    expect(debuggerRun.pageErrors).toEqual([]); expect(debuggerRun.externalRequests).toEqual([]);
  });

  test('visual summary separates the policy result from execution and hides debugging data', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'summary');
    await p.locator('.recorded-disclosure > summary').click();
    expect(await p.locator('.primary-status').textContent()).toContain('Shell command');
    expect(await p.locator('[data-fact="assessment"]').textContent()).toBe('Would block in enforce mode');
    expect(await p.locator('[data-fact="result"]').first().textContent()).toBe('Successful');
    const captured = JSON.parse((await p.locator('.exact-rule-data pre').textContent())!);
    expect(captured.rules[0].result.outcome.choice).toBe('PASS');
    expect(captured.rules[0].gateIds).toContain('evidence-confidence-below-threshold');
    expect(await p.locator('.summary-reason').textContent()).toContain('Evidence confidence was below the required threshold. No rule was classified as violated.');
    expect(await p.locator('[data-fact="result"]').textContent()).toBe('Successful');
    expect(captured.rules[0].result.evidence.probabilities.SUFFICIENT).toBe(.85);
    expect(captured.rules[0].thresholds.evidenceThreshold).toBe(.9);
    expect(await p.locator('.story-action').textContent()).toContain('git status --short');
    expect(await p.locator('.recorded-data').isVisible()).toBe(false);
    expect(await p.locator('.exact-rule-data').isVisible()).toBe(false);
    expect(await p.locator('.rule-question-link, .rule-outcome, .recorded-rule-facts, .confidence-note').count()).toBe(0);
    expect(await p.locator('.decision-title h2 span').first().isVisible()).toBe(false);
    for (const [width, height, name] of [[2233, 1282, 'user-2233'], [1536, 1024, 'comp'], [1440, 1000, 'desktop'], [390, 1000, 'mobile']] as const) {
      await p.setViewportSize({ width, height });
      await p.locator('.invocation').evaluate(el => el.scrollTop = 0);
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await p.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true });
    }
    await openRecordedData(p, 'Questions');
    expect(await p.locator('.exact-rules').getAttribute('open')).not.toBeNull();
    expect(await p.locator('.exact-rule-data').isVisible()).toBe(true);
    expect(await p.locator('.recorded-data').isVisible()).toBe(true);
    expect(debuggerRun.pageErrors).toEqual([]); expect(debuggerRun.externalRequests).toEqual([]);
  });

  test('coverage distinguishes unsupported, partial, unavailable and historical records without guessing model rationale', async ({ debuggerRun }) => {
    const p = debuggerRun.page, coverage = p.getByRole('region', { name: 'Runtime evidence coverage' });
    await pickCall(p, 'unknown');
    expect(await coverage.locator('dl > div').filter({ has: p.getByText('Action resolution', { exact: true }) }).locator('dd').textContent()).toBe('unsupported');
    expect(await p.locator('.summary-reason').textContent()).toContain('No rule was classified as violated');
    expect(await coverage.textContent()).toContain('do not explain');
    await pickCall(p, 'warn');
    await openRecordedData(p, 'Questions');
    expect(await p.locator('.summary-reason').textContent()).not.toContain('No rule was classified as violated');
    await pickCall(p, 'summary');
    expect(await coverage.textContent()).toContain('authenticated-partial');
    expect(await coverage.textContent()).toContain('2 known omissions');
    expect(await coverage.textContent()).toContain('1 shortened, 1 dropped, 1 prior omissions');
    expect(await coverage.locator('dl > div').filter({ has: p.getByText('Exact compaction', { exact: true }) }).locator('dd').textContent()).toBe('0 bytes saved');
    expect(await p.locator('.summary-reason').textContent()).toContain('Evidence confidence was below the required threshold');
    expect(await p.locator('[data-fact="result"]').textContent()).toBe('Successful');
    await p.setViewportSize({ width: 390, height: 844 });
    await coverage.scrollIntoViewIfNeeded();
    await p.screenshot({ path: join(artifacts, 'coverage-summary-mobile.png'), fullPage: true });
    await openRecordedData(p);
    expect(await p.evaluate(() => document.activeElement?.className)).toBe('submitted-evidence');
    const summaryOrder = await p.evaluate(() => !!(document.querySelector('.submitted-evidence')!.compareDocumentPosition(document.querySelector('[aria-label="Runtime evidence coverage"]')!) & Node.DOCUMENT_POSITION_FOLLOWING));
    expect(summaryOrder).toBe(true);
    await reveal(p, '.exact-context');
    expect(await p.locator('.exact-context pre').textContent()).toContain('partial-effect-coverage');
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.screenshot({ path: join(artifacts, 'coverage-mobile.png'), fullPage: true });
    await p.setViewportSize({ width: 1536, height: 1024 });
    await pickCall(p, 'missing');
    expect(await coverage.locator('dl > div').filter({ has: p.getByText('Preparation', { exact: true }) }).locator('dd').textContent()).toBe('unavailable');
    expect(await coverage.textContent()).toContain('Final history counters unavailable');
    expect(await p.locator('.summary-reason').textContent()).not.toContain('No rule was classified');
    await pickCall(p, 'rich');
    expect(await coverage.textContent()).toContain('Not recorded');
    expect(await p.locator('.summary-reason').textContent()).not.toContain('No rule was classified');
  });


  test('exact compaction stays distinct from losses and the dock preserves the submitted pool without decoding', async ({ debuggerRun }) => {
    const p = debuggerRun.page; await pickCall(p, 'compacted');
    const coverage = p.getByRole('region', { name: 'Runtime evidence coverage' });
    expect(await coverage.textContent()).toContain('2 retained events, 2 known omissions');
    expect(await coverage.textContent()).toContain('2 shortened, 2 dropped, 0 prior omissions');
    expect(await coverage.locator('dl > div').filter({ has: p.getByText('Exact compaction', { exact: true }) }).locator('dd').textContent()).toMatch(/^[1-9][0-9]* bytes saved$/);
    expect(await coverage.textContent()).toContain('A shortened result still has a recorded observation; a missing result remains unknown.');
    expect(await coverage.textContent()).toContain('Matching IDs do not prove execution or success.');
    expect(await coverage.textContent()).toContain('Capture omissions can count source slots, not missing calls or effects.');
    expect(await p.locator('.lifecycle').textContent()).toContain('unknown');
    await openRecordedData(p);
    const history = p.locator('.evidence-section').filter({ has: p.locator('h4', { hasText: 'Chronological history' }) });
    const trajectory = JSON.parse((await history.locator('pre').textContent())!);
    expect(trajectory.values).toEqual({ v0: 'complete sanitized content '.repeat(30) });
    expect(trajectory.observations).toHaveLength(2);
    expect(trajectory.observations.map((event: any) => [event.callId, event.origin, event.timestamp])).toEqual([
      ['prior', 'host-tool-call', 3], ['prior', 'host-tool-result', 1],
    ]);
    expect(trajectory.observations[1].data.content.isError).toBe(true);
    expect(trajectory.observations[0].data.content.repeated).toEqual({ tenetHistory: { ref: 'v0' } });
    expect(typeof trajectory.observations[0].data.content.document.tenetExcerpt.head).toBe('string');
    expect(await history.textContent()).toContain('Exact references');
    await p.setViewportSize({ width: 390, height: 844 });
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await coverage.scrollIntoViewIfNeeded();
    await p.screenshot({ path: join(artifacts, 'history-groups-mobile.png'), fullPage: true });
  });
  for (const [change, expected] of [
    ['unrelated update', false],
    ['warning added and removed', true],
    ['warning text changed and restored', true],
  ] as const) test(`capture warning watch detects only warning text: ${change}`, async ({ debuggerRun: { page: p } }) => {
    await pickCall(p, 'summary');
    const watch = await p.evaluateHandle(watchCaptureWarnings);
    try {
      await p.evaluate(change => {
        const node = document.createElement('p');
        const text = document.createTextNode('Refreshing archive');
        node.append(text); document.querySelector('main')!.append(node);
        if (change === 'warning added and removed') {
          const warning = document.createElement('span');
          warning.textContent = 'Capture may be incomplete.';
          node.append(warning); warning.remove();
        } else if (change === 'warning text changed and restored') {
          text.data = 'Capture may be incomplete.';
          text.data = 'Archive refreshed';
        } else {
          node.setAttribute('aria-live', 'polite');
          text.data = 'Archive refreshed';
        }
        node.remove();
      }, change);
      expect(await watch.evaluate(watch => watch.stop())).toBe(expected);
      expect(await p.locator('main').textContent()).not.toContain('Capture may be incomplete.');
    } finally {
      await watch.evaluate(watch => watch.stop());
      await watch.dispose();
    }
  });
}
