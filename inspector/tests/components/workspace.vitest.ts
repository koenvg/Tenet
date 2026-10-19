import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createElement } from 'react';
import { page } from 'vitest/browser';
import SummaryWorkspace from '../../src/shared/SummaryWorkspace.js';
import { standaloneSummary } from '../../src/shared/standalone-adapter.js';
import { makeView } from './fixtures.js';
import type { SummaryWorkspaceModel } from '../../src/shared/model.js';

test('safe summary shows recorded facts and inert rule text without standalone payloads', async () => {
  await page.viewport(1280, 900);
  const view = makeView({ execution: 'executed' });
  view.rules[0]!.text = '<script>window.summaryProbe = true</script>';
  view.response = { value: { message: 'provider-response-sentinel' } };
  view.evidence = { ...view.evidence, unrelated: 'submitted-evidence-sentinel' };
  view.identity!.cwd = '/raw-path-sentinel';
  view.policy = { privateSource: 'raw-policy-sentinel' };
  view.rules[0]!.questions = { outcome: 'exact-question-sentinel', evidence: 'exact-question-sentinel' };
  view.rules[0]!.mapping = { reference: 'raw-mapping-sentinel' };
  view.rules[0]!.result!.privateSource = 'raw-result-sentinel';
  const model = standaloneSummary(view);
  const serialized = JSON.stringify(model);
  for (const raw of ['Recorded instructions', 'window.hostile', 'first_outcome', 'payload', 'questions', 'response', 'mapping', 'provider-response-sentinel', 'submitted-evidence-sentinel', 'raw-path-sentinel', 'raw-policy-sentinel', 'exact-question-sentinel', 'raw-mapping-sentinel', 'raw-result-sentinel']) {
    expect(serialized).not.toContain(raw);
  }
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { calls: [], selected: model, coverage: 'Best-effort synthetic capture.', loading: false, error: '', category: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  expect(model.recordedAction).toEqual({ field: 'command', text: 'git status --short', truncated: false });
  await expect.element(screen.getByRole('region', { name: 'Recorded call' }).getByText('git status --short')).toBeVisible();
  await screen.getByText('Recording details', { exact: true }).click();
  await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
  await screen.getByText('Why this assessment', { exact: true }).click();
  await screen.getByText('Selected check details', { exact: true }).click();
  await expect.element(screen.getByText('<script>window.summaryProbe = true</script>').first()).toBeVisible();
  expect(screen.container.querySelector('script')).toBeNull();
  for (const raw of ['provider-response-sentinel', 'submitted-evidence-sentinel', 'raw-path-sentinel', 'raw-policy-sentinel', 'exact-question-sentinel', 'raw-mapping-sentinel', 'raw-result-sentinel']) expect(screen.container.textContent).not.toContain(raw);
  expect(Object.hasOwn(window, 'summaryProbe')).toBe(false);
  expect(screen.container.textContent).toContain('standalone inspector');
});

for (const [viewport, container] of [[390, 390], [1280, 390], [1280, 1000]]) {
  test(`workspace navigation follows ${container}px container in ${viewport}px window`, async () => {
    await page.viewport(viewport!, 844);
    const view = makeView({ execution: 'executed' });
    const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { calls: [], selected: standaloneSummary(view), category: '', coverage: 'Synthetic coverage stays visible.', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
    screen.container.style.width = `${container}px`;
    screen.container.style.maxWidth = '100%';
    if (container! < 650) {
      const navigation = screen.getByRole('navigation', { name: 'Workspace views' });
      await expect.element(navigation).toBeVisible();
      await navigation.getByRole('button', { name: 'Summary' }).click();
      await expect.element(screen.getByRole('region', { name: 'Recorded call' })).toBeVisible();
      await expect.element(screen.getByText('Synthetic coverage stays visible.')).toBeVisible();
      await expect.element(screen.getByRole('button', { name: 'Refresh archive' })).toBeVisible();
      await screen.getByText('Why this assessment', { exact: true }).click();
      await screen.getByRole('button', { name: 'Inspect evidence confidence' }).click();
      await expect.element(screen.getByRole('heading', { name: 'Evidence confidence' })).toBeVisible();
      await screen.getByText(/^Browse all rules/).click();
      await screen.getByRole('button', { name: /Record every file edit/ }).click();
      await expect.element(screen.getByRole('heading', { name: 'Rule at line 9' })).toBeVisible();
      await navigation.getByRole('button', { name: 'Calls' }).click();
      await expect.element(screen.getByRole('complementary', { name: 'Call explorer' })).toBeVisible();
    } else {
      await expect.element(screen.getByRole('region', { name: 'Recorded call' })).toBeVisible();
      await expect.element(screen.getByRole('complementary', { name: 'Call explorer' })).toBeVisible();
    }
    const workspace = screen.container.querySelector<HTMLElement>('.tenet-summary-workspace')!;
    expect(workspace.scrollWidth).toBeLessThanOrEqual(workspace.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });
}
test('shared workspace keeps the standalone summary hierarchy and check disclosures', async () => {
  await page.viewport(1280, 900);
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { calls: [], selected: standaloneSummary(makeView()), category: '', coverage: 'Synthetic', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('[aria-label="Decision map"]')?.checkVisibility()).toBe(false);
  await screen.getByText('Why this assessment', { exact: true }).click();
  await expect.element(screen.getByRole('group', { name: 'Decision map' })).toBeVisible();
  await screen.getByRole('button', { name: 'Inspect evidence confidence' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Evidence confidence' })).toBeVisible();
  expect(document.activeElement?.textContent).toContain('Evidence confidence');
  await screen.getByText(/^Browse all rules/).click();
  await screen.getByRole('button', { name: /Record every file edit/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Rule at line 9' })).toBeVisible();
  expect([...screen.container.querySelectorAll('.common-summary > details > summary')].map(node => node.textContent)).toEqual(['Why this assessment', 'Recording details', 'Recorded judge']);
  expect(screen.container.querySelector('.evidence-dock')).toBeNull();
});


for (const [name, options, text] of [
  ['pass', { decision: 'ALLOW', gate: null }, 'No blocking issues or approval requirements were recorded.'],
  ['selected FAIL', { choice: 'FAIL', gate: 'rule-fail' }, 'A policy rule was reported as violated.'],
  ['uncertain PASS', {}, 'Evidence confidence was below the required threshold.'],
  ['approval', { choice: 'APPROVAL_REQUIRED', decision: 'ASK', gate: null }, 'An approval condition was recorded.'],
  ['provider failure', { failure: 'provider-error' }, 'Assessment unavailable. No completed assessment is available.'],
] as const) test(`shared summary preserves ${name} meaning`, async () => {
  await page.viewport(1280, 900);
  const summary = standaloneSummary(makeView(options));
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { calls: [], selected: summary, category: '', coverage: 'Synthetic', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await screen.getByText('Recording details', { exact: true }).click();
  await expect.element(screen.getByText(text)).toBeVisible();
  if (name === 'provider failure') await expect.element(screen.getByText('Recorded assessment: unavailable · provider-error.')).toBeVisible();
});

test('historical thresholds and built-in identity are recorded inputs, not current policy', async () => {
  await page.viewport(1280, 900);
  const view = makeView();
  view.rules[0]!.thresholds.evidenceThreshold = .91;
  view.rules[0]!.builtin = true;
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { calls: [], selected: standaloneSummary(view), category: '', coverage: 'Synthetic', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await screen.getByText('Why this assessment', { exact: true }).click();
  await screen.getByText('Selected check details', { exact: true }).click();
  await expect.element(screen.getByText('Built-in integrity').first()).toBeVisible();
  expect(screen.container.querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe('0.85; required confidence 0.91');
});

test('supplied recorded evaluator failure stays distinct from execution and a legacy status', async () => {
  await page.viewport(1280, 900);
  const summary = standaloneSummary({ ...makeView({ execution: 'executed', decision: 'ALLOW', gate: null }),
    evaluatorState: { status: 'unavailable', reason: 'provider-error' } });
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model: { calls: [], selected: summary, category: '', coverage: 'Synthetic', loading: false, error: '' }, actions: { selectCall() {}, filterCategory() {}, refresh() {} } }));
  await screen.getByText('Recording details', { exact: true }).click();
  await expect.element(screen.getByText('Recorded assessment: unavailable · provider-error.')).toBeVisible();
  await expect.element(screen.getByText('Assessment unavailable. No completed assessment is available.')).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
});

test('same-minute shell calls have distinct readable names and preserve opaque selection keys', async () => {
  await page.viewport(1280, 900);
  const callIds = ['84c58a9c-6511-4ba4-8c19-96d2d8f017e0', '33060fd5-cf43-469e-9227-7690adbca4b7'];
  const ids = callIds.map(id => `opaque:${id}`);
  const timestamp = new Date(2025, 2, 18, 1, 0).getTime();
  const selectCall = vi.fn();
  const model: SummaryWorkspaceModel = {
    calls: callIds.map((callId, index) => ({ id: ids[index]!, callId, toolName: 'bash', timestamp, mode: 'observe', decision: '', permission: 'released', execution: 'executed', categories: ['unavailable'], missing: [], assessmentStatus: 'unavailable', failure: 'provider-error' })),
    selected: null, selectedId: ids[0], category: '', coverage: 'Synthetic', loading: false, error: '',
  };
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model, actions: { selectCall, filterCategory() {}, refresh() {} } }));
  const calls = screen.getByRole('navigation', { name: 'Invocations' });
  const first = calls.getByRole('button', { name: /Shell command.*Call 1\b/ });
  const second = calls.getByRole('button', { name: /Shell command.*Call 2\b/ });
  for (const [index, row] of [first, second].entries()) {
    await expect.element(row.getByText(`Call ${index + 1}`, { exact: true })).toBeVisible();
    await expect.element(row.getByText('01:00 AM', { exact: true })).toBeVisible();
    await expect.element(row.getByText('Ran', { exact: true })).toBeVisible();
    await expect.element(row.getByText('Observe', { exact: true })).toBeVisible();
    await expect.element(row.getByText('Evaluator unavailable', { exact: true })).toBeVisible();
  }
  await expect.element(first).toHaveAttribute('aria-pressed', 'true');
  await expect.element(second).toHaveAttribute('aria-pressed', 'false');
  for (const raw of [...callIds, ...ids]) expect(screen.container.innerText).not.toContain(raw);
  await first.click();
  await second.click();
  expect(selectCall.mock.calls).toEqual([[ids[0]], [ids[1]]]);
});

for (const width of [1000, 390]) {
  test(`readable recording details preserve opaque keys in ${width}px desktop container`, async () => {
    await page.viewport(1280, 1000);
    const callId = 'call_01JQ8V9TQFN9DMG75HP4X3HMAW_toolu_019cw6xvJpDL7eFA8CZUFJ9R';
    const sessionId = 'session_01JQ8TKQRYW5G9RH6G3DDB9CVF_bba331a3d2e84696a7e8';
    const digest = 'a7316b893b2685d49a50f1268e2043cc98cb588c766db0f01a21970a596128b9';
    const longTool = 'mcp__workspace__inspect_recorded_assessment_without_private_action_context';
    const selected = standaloneSummary(makeView({ callId, execution: 'unknown', permission: 'released' }));
    selected.identity!.toolName = longTool;
    selected.decision = '';
    selected.assessmentStatus = 'incomplete';
    selected.evaluatorState = { status: 'incomplete', reason: 'assessment-not-recorded' };
    selected.reportedViolations = { assessment: 'unavailable', uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 };
    selected.missing = ['assessment', 'execution'];
    selected.metadata = { schemas: [1, 2], questionVersion: 'recorded-questions-2025-03-18-long-version', profile: 'recorded-profile-with-long-historical-contract-name', policyDigest: digest };
    const ids = [callId, `${callId}_second`, `${callId}_long`, `${callId}_missing`];
    const started = new Date('2025-03-18T14:32:00Z').getTime();
    const model: SummaryWorkspaceModel = {
      calls: ids.map((id, index) => ({ id: `opaque:${id}`, callId: id, toolName: index < 2 ? 'bash' : index === 2 ? longTool : '', timestamp: started + index * 60000, mode: 'observe', decision: '', permission: 'released', execution: 'unknown', categories: ['pending'], missing: ['assessment', 'execution'], assessmentStatus: 'incomplete', failure: null })),
      selected, selectedId: `opaque:${callId}`, category: '', coverage: 'Best-effort synthetic capture.', loading: false, error: '',
      sessionId, sessions: [{ id: sessionId, started, calls: 4, categoryCounts: { violation: 0, unavailable: 0, uncertainty: 0, approval: 0, pending: 4 } }],
    };
    const selectCall = vi.fn(), selectSession = vi.fn();
    const screen = await render(createElement(SummaryWorkspace, { variant: 'calls', model, actions: { selectCall, selectSession, filterCategory() {}, refresh() {} } }));
    screen.container.style.width = `${width}px`;
    screen.container.style.maxWidth = '100%';
    const workspace = screen.container.querySelector<HTMLElement>('.tenet-summary-workspace')!;
    const visibleText = () => workspace.innerText;
    const assertNoTechnicalText = () => {
      for (const text of [...ids, sessionId, sessionId.slice(0, 8), digest, selected.metadata!.questionVersion, selected.metadata!.profile]) expect(visibleText()).not.toContain(text);
    };
    const assertNoOverflow = () => {
      expect(workspace.scrollWidth).toBeLessThanOrEqual(workspace.clientWidth);
      for (const node of workspace.querySelectorAll<HTMLElement>('p, button, select, dd')) {
        if (node.checkVisibility()) expect(node.scrollWidth, node.textContent ?? '').toBeLessThanOrEqual(node.clientWidth + 1);
      }
    };
    await expect.element(screen.getByRole('complementary', { name: 'Call explorer' })).toBeVisible();
    assertNoTechnicalText();
    const rows = [...workspace.querySelectorAll<HTMLButtonElement>('.call-row')];
    expect(rows).toHaveLength(4);
    for (const [index, row] of rows.entries()) {
      expect(row.innerText).toContain(index < 2 ? 'Shell command' : index === 2 ? longTool : 'Unknown tool');
      expect(row.innerText).toContain(new Date(started + index * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      expect(row.innerText).toContain('Released');
      if (index) expect(rows[index - 1]!.getBoundingClientRect().bottom).toBeLessThanOrEqual(row.getBoundingClientRect().top);
    }
    assertNoOverflow();
    const sessionOption = workspace.querySelector<HTMLOptionElement>('select[aria-label="Linked session"] option')!;
    expect(sessionOption.textContent).toBe(`${new Date(started).toLocaleString()} · 4 calls`);
    await screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button', { name: /Shell command.*Call 1\b/ }).click();
    expect(selectCall).toHaveBeenLastCalledWith(`opaque:${callId}`);
    if (width === 390) await screen.getByRole('button', { name: 'Calls', exact: true }).click();
    await screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button', { name: /Shell command.*Call 2\b/ }).click();
    expect(selectCall).toHaveBeenLastCalledWith(`opaque:${callId}_second`);
    await expect.element(screen.getByRole('region', { name: 'Recorded call' })).toBeVisible();
    expect(workspace.querySelector('.assessment-state')?.checkVisibility()).toBe(false);
    assertNoTechnicalText();
    const paragraphs = [...workspace.querySelectorAll<HTMLElement>('.decision-header p')].filter(node => node.checkVisibility());
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    const textRects = paragraphs.map(node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].filter(rect => rect.width && rect.height);
    });
    for (let i = 0; i < textRects.length; i++) for (let j = i + 1; j < textRects.length; j++) {
      for (const a of textRects[i]!) for (const b of textRects[j]!) expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, `${paragraphs[i]!.textContent} overlaps ${paragraphs[j]!.textContent}`).toBe(false);
    }
    assertNoOverflow();
    expect(visibleText()).not.toContain('Recording incomplete:');
    expect(visibleText()).not.toContain('assessment, execution');
    await screen.getByText('Recording details', { exact: true }).click();
    await expect.element(screen.getByText('Recorded assessment: incomplete · assessment-not-recorded.')).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Decision unavailable', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Execution unknown. Released permission does not prove dispatch or execution.')).toBeVisible();
    const details = screen.getByRole('group', { name: 'Recording details' });
    for (const text of [callId, digest, selected.metadata.questionVersion, selected.metadata.profile]) await expect.element(details.getByText(text, { exact: true })).toBeVisible();
    await expect.element(details.getByText('1, 2', { exact: true })).toBeVisible();
    await expect.element(details.getByText('Missing records', { exact: true })).toBeVisible();
    await expect.element(details.getByText('assessment, execution', { exact: true })).toBeVisible();
    assertNoOverflow();
    await screen.getByText('Session recording details', { exact: true }).click();
    await expect.element(screen.getByText(sessionId, { exact: true })).toBeVisible();
    assertNoOverflow();
  });
}

test('readable recording details keep older session selection and paging keys', async () => {
  await page.viewport(1280, 900);
  const olderId = 'a'.repeat(64), listedId = 'b'.repeat(64);
  const selectSession = vi.fn(), loadMoreSessions = vi.fn();
  const screen = await render(createElement(SummaryWorkspace, { variant: 'calls',
    model: { calls: [], selected: null, category: '', coverage: 'Synthetic', loading: false, error: '', sessionId: olderId, moreSessions: true,
      sessions: [{ id: listedId, started: 1742308320000, calls: 2, categoryCounts: { violation: 0, unavailable: 0, uncertainty: 0, approval: 0, pending: 2 } }] },
    actions: { selectCall() {}, filterCategory() {}, refresh() {}, selectSession, loadMoreSessions: () => loadMoreSessions() },
  }));
  const picker = screen.getByRole('combobox', { name: 'Linked session' });
  const select = screen.container.querySelector<HTMLSelectElement>('select[aria-label="Linked session"]')!;
  expect(select.value).toBe(olderId);
  expect(select.selectedOptions[0]!.textContent).toBe('Selected older session · Load more sessions for counts');
  expect(screen.container.innerText).not.toContain(olderId.slice(0, 8));
  expect(screen.container.innerText).not.toContain(listedId.slice(0, 8));
  await screen.getByRole('button', { name: 'More sessions', exact: true }).click();
  expect(loadMoreSessions).toHaveBeenCalledExactlyOnceWith();
  await picker.selectOptions(listedId);
  expect(selectSession).toHaveBeenCalledExactlyOnceWith(listedId);
  await screen.getByText('Session recording details', { exact: true }).click();
  await expect.element(screen.getByText(olderId, { exact: true })).toBeVisible();
});
