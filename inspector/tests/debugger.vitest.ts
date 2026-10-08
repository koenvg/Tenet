import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startInspector } from '../../src/inspector/server.js';
import { browserFixture, recordedQuestion } from './browser-fixture.js';
import { sessionKey } from '../../src/recording/archive.js';
import { openRecordedData, reveal } from './ui-navigation.js';
let browser: Browser | undefined, context: BrowserContext | undefined, page: Page | undefined;
let app: Awaited<ReturnType<typeof startInspector>> | undefined;
let directory: string | undefined;
let externalRequests: string[] = [], pageErrors: string[] = [];
const artifacts = resolve('coverage/inspector-artifacts/playwright');
const currentPage = () => { if (!page) throw new Error('Browser page unavailable'); return page; };
const pickCall = async (id: string) => {
  const p = currentPage();
  await p.locator('.call-row').filter({ has: p.locator('.call-id', { hasText: new RegExp(`^${id}$`) }) }).click();
  await expect.poll(() => p.locator('.decision-title h2 span').textContent()).toBe(id);
  await reveal(p, '.recorded-disclosure');
  await reveal(p, '.recording-details');
};

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-playwright-')));
  await browserFixture(directory);
  const unrelated = join(directory, sessionKey('unrelated-session'));
  await mkdir(unrelated, { mode: 0o700 });
  await writeFile(join(unrelated, 'pending.tmp'), 'in progress', { mode: 0o600 });
  app = await startInspector({ directory, assets: resolve('inspector/dist') });
  await mkdir(artifacts, { recursive: true });
});

beforeEach(async () => {
  if (!browser || !app) throw new Error('Temporary inspector or headless browser unavailable');
  context = await browser.newContext({ viewport: { width: 2233, height: 1282 } });
  page = await context.newPage();
  pageErrors = []; externalRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', route => {
    // The fixture permits only requests to its temporary loopback server.
    if (new URL(route.request().url()).origin === app!.origin) return route.continue();
    externalRequests.push(route.request().url()); return route.abort();
  });
  await page.goto(app.origin);
  await expect.poll(() => currentPage().locator('.call-row').count()).toBe(11);
  await page.locator('[aria-label="Decision summary"]').waitFor();
});

for (const width of [1280, 390]) test(`default story and keyboard disclosures at ${width}px`, async () => {
  const p = currentPage(); await p.setViewportSize({ width, height: 844 });
  if (width <= 900) await p.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls' }).click();
  await p.locator('.call-row').filter({ has: p.locator('.call-id', { hasText: /^summary$/ }) }).click();
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
afterEach(async taskContext => {
  if (page && (taskContext.task.result?.state === 'fail' || externalRequests.length || pageErrors.length)) {
    await page.screenshot({ path: join(artifacts, `failure-${taskContext.task.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 100)}.png`), fullPage: true }).catch(() => {});
  }
  try { await context?.close(); } finally { context = undefined; page = undefined; }
  expect(externalRequests, 'non-local requests must not leave this test').toEqual([]);
  expect(pageErrors, 'uncaught browser errors must not leave this test').toEqual([]);
});
afterAll(async () => {
  await app?.close();
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('background refresh does not flash archive-wide warnings into the selected session', async () => {
  const p = currentPage(); await pickCall('summary');
  let completedPolls = 0;
  p.on('response', response => { if (response.url().includes('/invocations/')) completedPolls++; });
  const before = await p.locator('.decision-title').boundingBox();
  const mutations = await p.evaluate(() => new Promise<number>(resolve => {
    let count = 0;
    const observer = new MutationObserver(records => count += records.length);
    observer.observe(document.querySelector('main')!, { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 4500);
  }));
  expect(completedPolls).toBeGreaterThanOrEqual(2);
  expect(mutations).toBe(0);
  expect(await p.locator('.decision-title').boundingBox()).toEqual(before);
  expect(await p.getByRole('region', { name: 'Recording issues' }).count()).toBe(1);
  expect(await p.locator('.issues-body').textContent()).not.toContain('Capture may be incomplete.');
  expect(pageErrors).toEqual([]);
});

test('session switcher stays open during polling and project filtering', async () => {
  const p = currentPage(), picker = p.locator('.session-picker');
  await picker.locator('summary').click();
  await expect.poll(() => picker.getAttribute('open')).not.toBeNull();
  const filter = p.getByRole('combobox', { name: 'Project directory' });
  await filter.fill('/historical');
  let completedPolls = 0;
  p.on('response', response => { if (response.url().includes('/invocations/')) completedPolls++; });
  await expect.poll(() => completedPolls, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  expect(await picker.getAttribute('open')).not.toBeNull();
  expect(await filter.inputValue()).toBe('/historical');
  await p.getByRole('button', { name: 'Filter projects' }).click();
  await expect.poll(() => p.locator('.session-row').count()).toBe(1);
  expect(await picker.getAttribute('open')).not.toBeNull();
  await p.getByRole('button', { name: 'All projects' }).click();
  expect(await picker.getAttribute('open')).not.toBeNull();
  await p.locator('.session-row').first().click();
  await expect.poll(() => picker.getAttribute('open')).toBeNull();
  expect(pageErrors).toEqual([]);
});

test('Focus sidebar scrolls independently and keeps the selected summary', async () => {
  const p = currentPage(); await p.setViewportSize({ width: 1440, height: 700 }); await pickCall('summary');
  const list = p.locator('.explorer');
  expect(await list.evaluate(el => getComputedStyle(el).flexDirection)).toBe('column');
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  const before = await p.locator('.invocation').evaluate(el => el.scrollTop);
  await list.evaluate(el => el.scrollTop = 0);
  await list.evaluate(el => el.scrollTop = el.scrollHeight);
  expect(await p.locator('.invocation').evaluate(el => el.scrollTop)).toBe(before);
  expect(await p.locator('.call-row[aria-pressed="true"] .call-id').textContent()).toBe('summary');
  const sidebar = (await p.locator('.explorer').boundingBox())!;
  expect((await p.locator('.inspection').boundingBox())!.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
});

test('exact records are keyboard accessible and reduced motion stays static', async () => {
  const p = currentPage(); await pickCall('summary');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.locator('.exact-rules > summary').press('Enter');
  expect(await p.locator('.exact-rules').getAttribute('open')).not.toBeNull();
  await p.keyboard.press('Tab');
  expect(await p.evaluate(() => document.activeElement?.className)).toBe('exact-rule-data');
  expect(await p.locator('.exact-rule-data').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await p.locator('.primary-status .map-connections').count()).toBe(0);
});

test('pane dividers drag, respond to keys, clamp and retain their sizes across calls', async () => {
  const p = currentPage(); await pickCall('low-pass');
  expect(await p.locator('input[type="range"]').count()).toBe(0);
  const explorer = p.getByRole('separator', { name: 'Resize call explorer' });
  const start = await explorer.boundingBox(); expect(start).not.toBeNull();
  await p.mouse.move(start!.x + start!.width / 2, start!.y + 100);
  await p.mouse.down(); await p.mouse.move(start!.x + start!.width / 2 + 80, start!.y + 100, { steps: 8 }); await p.mouse.up();
  await expect.poll(() => explorer.getAttribute('aria-valuenow')).toBe('380');
  expect(Math.round((await p.locator('.explorer').boundingBox())!.width)).toBe(380);
  expect(await p.getByRole('separator', { name: 'Resize assessment pane' }).count()).toBe(0);
  await explorer.press('End'); await explorer.press('ArrowRight');
  expect(await explorer.getAttribute('aria-valuenow')).toBe('460');
  await explorer.press('Home'); await explorer.press('ArrowLeft');
  expect(await explorer.getAttribute('aria-valuenow')).toBe('220');
  await explorer.press('Shift+ArrowRight');
  expect(await explorer.getAttribute('aria-valuenow')).toBe('270');
  await pickCall('unknown');
  await openRecordedData(p, 'Questions');
  expect(await explorer.getAttribute('aria-valuenow')).toBe('270');
  expect(await p.locator('.pane-resizer.dragging').count()).toBe(0);
  expect(pageErrors).toEqual([]);
});

test('Ran is neutral and finding tones are separate while exact recorded choices remain separate', async () => {
  const p = currentPage(); await pickCall('summary');
  const ran = p.locator('.call-row[aria-pressed="true"] [data-list-fact="result"] .status-chip').first();
  expect((await ran.textContent())?.trim()).toBe('Successful');
  expect(await ran.evaluate(el => getComputedStyle(el).color)).toBe('rgb(70, 87, 107)');
  expect(await ran.locator('svg[aria-hidden="true"]').count()).toBe(0);
  for (const [id, state, color, background] of [
    ['summary', 'caution', 'rgb(121, 86, 23)', 'rgb(252, 242, 222)'],
    ['integrity', 'danger', 'rgb(190, 55, 55)', 'rgb(251, 236, 235)'],
    ['approval', 'approval', 'rgb(98, 65, 154)', 'rgb(240, 234, 251)'],
  ] as const) {
    await pickCall(id);
    const badge = p.locator(`[data-fact="findings"] .${state}`).first();
    expect(await badge.evaluate(el => getComputedStyle(el).color)).toBe(color);
    expect(await badge.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await badge.locator('svg[aria-hidden="true"]').count()).toBe(0);
    expect(await p.locator('.call-row[aria-pressed="true"] .status-chip').count()).toBe(2);
    expect(await p.locator('.call-row[aria-pressed="true"] .call-concern').count()).toBe(1);
  }
  await pickCall('low-pass');
  await openRecordedData(p, 'Questions');
  const pass = JSON.parse((await p.locator('.exact-rule-data pre').textContent())!).rules[0];
  expect(pass.result.outcome.choice).toBe('PASS');
  expect(pass.result.outcome.probabilities.PASS).toBe(.88);
  expect(pass.gateIds).toContain('outcome-confidence-below-threshold');
  expect(await p.locator('.decision-explanation').textContent()).toContain('PASS selected at 0.88');
  for (const [id, choice] of [['unknown', 'UNKNOWN'], ['approval', 'APPROVAL_REQUIRED'], ['integrity', 'FAIL']]) {
    await pickCall(id!); await openRecordedData(p, 'Questions');
    const rule = JSON.parse((await p.locator('.exact-rule-data pre').textContent())!).rules.find((rule: { builtin: boolean }) => rule.builtin === (id === 'integrity'));
    expect(rule.result.outcome.choice).toBe(choice);
  }
});

test('exact records distinguish confidence, evidence, advice, approval and integrity without deriving gates', async () => {
  const p = currentPage();
  for (const [id, gate] of [
    ['low-pass', 'outcome-confidence-below-threshold'], ['unknown', 'outcome-unknown'],
    ['approval', null], ['evidence', 'evidence-insufficient'],
    ['evidence-confidence', 'evidence-confidence-below-threshold'], ['warn', 'rule-fail'], ['integrity', 'rule-fail'],
  ]) {
    await pickCall(id!); await openRecordedData(p, 'Questions');
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
  await pickCall('summary');
  expect((await p.locator('.call-row[aria-pressed="true"] [data-list-fact="result"] .status-chip').first().textContent())?.trim()).toBe('Successful');
  expect(externalRequests).toEqual([]); expect(pageErrors).toEqual([]);
});

test('captured questions retain exact Markdown and hostile strings as inert JSON', async () => {
  const p = currentPage(); await pickCall('rich'); await openRecordedData(p, 'Questions');
  const questions = p.locator('.exact-rules');
  const captured = JSON.parse((await questions.locator('pre').textContent())!);
  expect(captured.questionVersion).toBe('historical-test-v1');
  expect(captured.rules[0].mapping.reference).toBe('state.policy.rules[0].text');
  expect(captured.rules[0].questions.outcome).toEqual(recordedQuestion);
  expect(Object.keys(captured.rules[0].questions.outcome.criteria)).toEqual(['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED']);
  expect(await questions.locator('script, img, iframe, a, object').count()).toBe(0);
  expect(await p.evaluate(() => (window as Window & { hostile?: boolean }).hostile)).toBeUndefined();
  expect(await questions.locator('.rich-markdown, .question-rich, .answer-choices').count()).toBe(0);
  expect(externalRequests).toEqual([]); expect(pageErrors).toEqual([]);
});

test('evidence scroll survives opening exact records and adjacent disclosures', async () => {
  const p = currentPage(); await p.setViewportSize({ width: 1280, height: 700 }); await pickCall('low-pass');
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

test('sidebar and selected call do not overlap at intermediate widths or after resizing', async () => {
  const p = currentPage(); await pickCall('summary');
  for (const width of [901, 1024, 1100]) {
    await p.setViewportSize({ width, height: 900 });
    const sidebar = (await p.locator('.explorer').boundingBox())!;
    const workspace = (await p.locator('.inspection').boundingBox())!;
    const divider = (await p.getByRole('separator', { name: 'Resize call explorer' }).boundingBox())!;
    expect(workspace.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
    expect(workspace.width).toBeGreaterThan(width / 2);
    expect(Math.abs(divider.y - sidebar.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(divider.height - sidebar.height)).toBeLessThanOrEqual(1);
    await expectBoundedSummary(p);
  }
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.getByRole('separator', { name: 'Resize call explorer' }).press('End');
  await expectBoundedSummary(p);
});

test('mobile views retain selection, hide drag handles and avoid horizontal overflow', async () => {
  const p = currentPage(); await pickCall('rich');
  for (const width of [390, 320, 768]) {
    await p.setViewportSize({ width, height: 844 });
    expect(await p.getByRole('separator').count()).toBe(0);
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expectBoundedSummary(p);
    await openRecordedData(p, 'Questions');
    await p.locator('.exact-rule-data').waitFor({ state: 'visible' });
    expect(await p.evaluate(() => document.activeElement?.className)).toBe('exact-rule-data');
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.getByRole('button', { name: 'Calls', exact: true }).click();
    await p.getByRole('button', { name: 'Selected call', exact: true }).click();
    await p.getByRole('region', { name: 'Exact rule records and captured questions', exact: true }).waitFor({ state: 'visible' });
    expect(await p.locator('.decision-title h2 span').textContent()).toBe('rich');
  }
});

test('missing evidence is explicit and archive errors recover without a fake pass', async () => {
  const p = currentPage(); await pickCall('missing');
  expect(await p.locator('.decision-explanation').textContent()).toContain('timeout');
  const missing = JSON.parse((await p.locator('.exact-rule-data pre').textContent())!).rules[0];
  expect(missing.gateIds).toBeNull(); expect(missing.result).toBeNull();
  expect(await p.locator('.submitted-evidence').textContent()).toContain('Submitted evidence unavailable');
  expect(await p.locator('.lifecycle').textContent()).toContain('unknown');
  await p.route('**/api/sessions?*', route => route.fulfill({ status: 503, body: '{}' }));
  await reveal(p, '.session-picker');
  await p.getByRole('button', { name: 'Refresh archive', exact: true }).click();
  await p.getByRole('alert').waitFor();
  expect(await p.getByRole('alert').textContent()).toContain('503');
  await p.unroute('**/api/sessions?*');
  await p.getByRole('button', { name: 'Refresh archive', exact: true }).click();
  await p.getByRole('alert').waitFor({ state: 'hidden' });
  await p.getByRole('region', { name: 'Decision summary', exact: true }).waitFor();
  expect(pageErrors).toEqual([]); expect(externalRequests).toEqual([]);
});

test('visual summary separates the policy result from execution and hides debugging data', async () => {
  const p = currentPage(); await pickCall('summary');
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
  expect(await p.locator('.call-id').first().isVisible()).toBe(false);
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
  expect(pageErrors).toEqual([]); expect(externalRequests).toEqual([]);
});

test('coverage distinguishes unsupported, partial, unavailable and historical records without guessing model rationale', async () => {
  const p = currentPage(), coverage = p.getByRole('region', { name: 'Runtime evidence coverage' });
  await pickCall('unknown');
  expect(await coverage.locator('dl > div').filter({ has: p.getByText('Action resolution', { exact: true }) }).locator('dd').textContent()).toBe('unsupported');
  expect(await p.locator('.summary-reason').textContent()).toContain('No rule was classified as violated');
  expect(await coverage.textContent()).toContain('do not explain');
  await pickCall('warn');
  await openRecordedData(p, 'Questions');
  expect(await p.locator('.summary-reason').textContent()).not.toContain('No rule was classified as violated');
  await pickCall('summary');
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
  await pickCall('missing');
  expect(await coverage.locator('dl > div').filter({ has: p.getByText('Preparation', { exact: true }) }).locator('dd').textContent()).toBe('unavailable');
  expect(await coverage.textContent()).toContain('Final history counters unavailable');
  expect(await p.locator('.summary-reason').textContent()).not.toContain('No rule was classified');
  await pickCall('rich');
  expect(await coverage.textContent()).toContain('Not recorded');
  expect(await p.locator('.summary-reason').textContent()).not.toContain('No rule was classified');
});


test('exact compaction stays distinct from losses and the dock preserves the submitted pool without decoding', async () => {
  const p = currentPage(); await pickCall('compacted');
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
