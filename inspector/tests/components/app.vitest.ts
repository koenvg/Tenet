import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import App from "../../src/App.js";
import { makeView } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

const sessionId = 'a'.repeat(64), latestId = 'b'.repeat(64), olderId = 'c'.repeat(64);
const sessions = [{ id: sessionId, sessionId: 'offline-session', projects: ['/offline'], timestamp: 200, started: 100,
  invocations: 2, concerns: 1, unavailable: 0, coverage: 'best-effort' }];
const calls = [
  { id: latestId, invocationId: 'latest', callId: 'latest', toolName: 'bash', timestamp: 200, updated: 200,
    decision: 'BLOCK', missing: [], failure: null, assessmentStatus: 'validated', mode: 'observe', permission: 'released', execution: 'unknown', categories: ['uncertainty', 'approval'] },
  { id: olderId, invocationId: 'older', callId: 'older', toolName: 'read', timestamp: 100, updated: 100,
    decision: 'ALLOW', missing: [], failure: null, assessmentStatus: 'validated', mode: 'observe', permission: 'released', execution: 'executed', categories: ['uncertainty'] },
];

function stubArchive(options: { fail?: () => boolean; hold?: Promise<void>; partial?: boolean; status?: { execution: string; permission: string; decision?: string } } = {}) {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw new Error(`Unexpected request ${url}`);
    if (init?.headers && 'Authorization' in init.headers) throw new Error('Unexpected authorization');
    const data = url.pathname === '/api/sessions' ? { sessions, next: null }
      : url.pathname === `/api/sessions/${sessionId}` ? { invocations: url.searchParams.get('category') ? calls.filter(c => c.categories.includes(url.searchParams.get('category')!)) : options.status ? [{ ...calls[0], ...options.status }] : calls, next: null }
      : url.pathname === `/api/sessions/${sessionId}/groups` ? { groups: { items: [{ policyIdentity: '["/offline/TENET.md","digest-a","/offline/TENET.md"]', profile: 'legacy', ruleId: 'rule-one', gate: 'evidence-confidence-below-threshold', count: 2,
          first: 100, last: 200, omitted: 0, invocations: [{ id: latestId, callId: 'latest', timestamp: 200 }, { id: olderId, callId: 'older', timestamp: 100 }] }], omittedGroups: 0 } }
      : url.pathname === `/api/sessions/${sessionId}/invocations/${latestId}` ? { view: makeView({ callId: 'latest', choice: 'APPROVAL_REQUIRED', ...options.status }) }
      : url.pathname === `/api/sessions/${sessionId}/invocations/${olderId}` ? { view: makeView({ callId: 'older', decision: 'ALLOW', gate: null, execution: 'executed' }) }
      : null;
    if (!data) throw new Error(`Unexpected API route ${url.pathname}`);
    requests.push(url.pathname);
    if (options.hold && url.pathname === '/api/sessions') await options.hold;
    if (options.fail?.()) return new Response('{}', { status: 503 });
    return Response.json({ ...data, issues: [], captureHealth: [], reader: { build: 'test-reader/abc', supportedSchemas: [1, 2, 3], unsupported: options.partial ? 1 : 0, newerUnsupported: options.partial ? 1 : 0, corrupt: 0, indexing: !!options.partial, otherIssues: 0 } });
  }));
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, '', location.pathname);
});

test('fresh visits select the latest call, then navigate without an archive server', async () => {
  await page.viewport(1280, 900);
  const requests = stubArchive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('.call-row[aria-pressed="true"] .call-id')?.textContent).toBe('latest');
  expect(screen.container.querySelector('.decision-title h2 span')?.textContent).toBe('latest');
  expect(requests).toContain(`/api/sessions/${sessionId}/invocations/${latestId}`);
  expect(location.search).toContain(`invocation=${latestId}`);
  await screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button').nth(1).click();
  await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('.decision-title h2 span')?.textContent).toBe('older');
  expect(location.search).toContain(`invocation=${olderId}`);
  expect(requests).toContain(`/api/sessions/${sessionId}/invocations/${olderId}`);
});

test('a deep link selects the requested call instead of the newest', async () => {
  history.replaceState(null, '', `?session=${sessionId}&invocation=${olderId}`);
  const requests = stubArchive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('.call-row[aria-pressed="true"] .call-id')?.textContent).toBe('older');
  expect(screen.container.querySelector('.decision-title h2 span')?.textContent).toBe('older');
  expect(requests).toContain(`/api/sessions/${sessionId}/invocations/${olderId}`);
  expect(requests).not.toContain(`/api/sessions/${sessionId}/invocations/${latestId}`);
});

test('component archive fixture rejects unknown API routes', async () => {
  stubArchive();
  await expect(fetch(`/api/sessions/${sessionId}/invocations/${'d'.repeat(64)}`)).rejects.toThrow('Unexpected API route');
});

test('loading state and manual failure recover without implying a pass', async () => {
  let release!: () => void, failing = false;
  const hold = new Promise<void>(resolve => { release = resolve; });
  stubArchive({ hold, fail: () => failing });
  const screen = await render(createElement(App));
  expect(screen.container.querySelector('[role="status"]')?.textContent).toContain('Reading archive');
  release();
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  failing = true;
  await screen.getByRole('button', { name: 'Refresh archive' }).click();
  await expect.element(screen.getByRole('alert')).toBeVisible();
  expect(screen.container.querySelector('[role="alert"]')?.textContent).toContain('503');
  failing = false;
  await screen.getByRole('button', { name: 'Refresh archive' }).click();
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
});

test('category filter, grouped references and partial reader coverage keep individual links usable', async () => {
  await page.viewport(1280, 900);
  const requests = stubArchive({ partial: true });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  await expect.element(screen.getByText(/Partial archive coverage: 1 unsupported schema records \(1 newer\)/)).toBeVisible();
  await expect.element(screen.getByText(/restart the inspector process/)).toBeVisible();
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('approval');
  await vi.waitFor(() => expect(screen.container.querySelectorAll('.call-row')).toHaveLength(1));
  expect(screen.container.querySelector('.explorer .uncertainty-groups')).toBeNull();
  expect(requests.some(path => path.endsWith('/groups'))).toBe(false);
  await screen.getByRole('button', { name: 'Uncertainty groups' }).click();
  await expect.element(screen.getByRole('region', { name: 'Uncertainty groups' }).getByText('Low evidence confidence')).toBeVisible();
  expect(requests.filter(path => path.endsWith('/groups'))).toHaveLength(1);
  await screen.getByRole('region', { name: 'Uncertainty groups' }).getByText('Low evidence confidence').click();
  await screen.getByRole('button', { name: /older ·/ }).click();
  expect((screen.container.querySelector('.pattern-view') as HTMLElement).hidden).toBe(true);
  await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
  expect(location.search).toContain(`invocation=${olderId}`);
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('uncertainty');
  await vi.waitFor(() => expect(screen.container.querySelectorAll('.call-row')).toHaveLength(2));
});

test('small screens keep calls, summary and session patterns as distinct views', async () => {
  await page.viewport(390, 844);
  stubArchive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  await screen.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls' }).click();
  expect(getComputedStyle(screen.container.querySelector('.inspection')!).display).toBe('none');
  await screen.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Patterns' }).click();
  await expect.element(screen.getByRole('region', { name: 'Uncertainty groups' }).getByText('Low evidence confidence')).toBeVisible();
  expect(getComputedStyle(screen.container.querySelector('.explorer')!).display).toBe('none');
  await screen.getByRole('region', { name: 'Uncertainty groups' }).getByText('Low evidence confidence').click();
  await screen.getByRole('button', { name: /older ·/ }).click();
  await expect.element(screen.getByRole('region', { name: 'Actual execution' }).getByText('Ran', { exact: true })).toBeVisible();
  expect((screen.container.querySelector('.pattern-view') as HTMLElement).hidden).toBe(true);
  await screen.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls' }).click();
  await expect.element(screen.getByRole('navigation', { name: 'Invocations' })).toBeVisible();
});

test('session patterns stay reachable without a matching call and focus returns after navigation', async () => {
  await page.viewport(1280, 900);
  const requests = stubArchive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('violation');
  await vi.waitFor(() => expect(screen.container.querySelectorAll('.call-row')).toHaveLength(0));
  (screen.container.querySelector('.session-picker summary') as HTMLElement).click();
  (screen.container.querySelector('.session-row') as HTMLButtonElement).click();
  await expect.element(screen.getByText('No calls match this finding category.')).toBeVisible();
  expect(requests.some(path => path.endsWith('/groups'))).toBe(false);
  await screen.getByRole('button', { name: 'Uncertainty groups' }).click();
  await expect.element(screen.getByRole('region', { name: 'Uncertainty groups' }).getByText('Low evidence confidence')).toBeVisible();
  expect(requests.filter(path => path.endsWith('/groups'))).toHaveLength(1);
  await screen.getByRole('region', { name: 'Uncertainty groups' }).getByText('Low evidence confidence').click();
  await screen.getByRole('button', { name: /latest ·/ }).click();
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(location.search).toContain(`invocation=${latestId}`);
  expect((document.activeElement as HTMLElement)?.textContent).toBe('Summary');
});


test('sidebar uses one status chip, quiet mode and one concern while detail keeps overlapping findings', async () => {
  await page.viewport(1280, 900);
  stubArchive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  const row = screen.container.querySelector('.call-row[aria-pressed="true"]')!;
  expect(row.querySelectorAll('.status-chip')).toHaveLength(1);
  expect(row.querySelector('.call-mode')?.textContent).toBe('Observe');
  expect(row.querySelectorAll('.call-concern')).toHaveLength(1);
  expect(row.querySelector('.call-concern')?.textContent).toContain('Approval condition +1');
  expect(row.querySelector('.call-concern')?.textContent).toContain('No recorded result');
  expect(screen.container.querySelectorAll('.primary-status .finding-chips .status-chip')).toHaveLength(2);
});

for (const [execution, permission, label, tone] of [
  ['executed', 'released', 'Ran', 'neutral'], ['failed', 'released', 'Failed', 'danger'],
  ['unknown', 'blocked', 'TENET blocked', 'danger'], ['unknown', 'released', 'Released', 'caution'],
  ['unknown', 'unknown', 'Execution unknown', 'neutral'], ['executed', 'blocked', 'Ran', 'neutral'],
  ['failed', 'blocked', 'Failed', 'danger'],
] as const) test(`list and summary agree for ${execution}/${permission}`, async () => {
  await page.viewport(1280, 900);
  stubArchive({ status: { execution, permission } });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  const list = screen.container.querySelector('.call-state .status-chip')!;
  const summary = screen.container.querySelector('.primary-badges .status-chip')!;
  expect(list.textContent?.trim()).toBe(label);
  expect(summary.textContent?.trim()).toBe(label);
  expect(list.classList.contains(tone)).toBe(true);
  expect(summary.classList.contains(tone)).toBe(true);
  expect(screen.container.querySelector('.call-state')?.textContent).toContain('Observe');
  expect(screen.container.querySelector('.primary-status')?.textContent).toContain('Observe');
  if (label === 'Released') {
    expect(screen.container.querySelector('.call-concern')?.textContent).toContain('No recorded result');
    expect(screen.container.querySelector('.execution-summary')?.textContent).toContain('does not prove dispatch or execution');
  }
  const contradictory = permission === 'blocked' && execution !== 'unknown';
  expect(screen.container.querySelectorAll('.recording-inconsistency').length).toBe(contradictory ? 2 : 0);
  expect(screen.container.querySelectorAll('.call-row[aria-pressed="true"] .status-chip')).toHaveLength(1);
  expect(screen.container.querySelectorAll('.call-row[aria-pressed="true"] .call-concern')).toHaveLength(1);
  if (contradictory) expect(screen.container.querySelector('.primary-status .recording-inconsistency')?.textContent).toContain(`execution is ${execution}`);
});


test('a late call response cannot replace a newer manual selection', async () => {
  await page.viewport(1280, 900);
  const requests = stubArchive(), fetchArchive = fetch;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (new URL(input, location.href).pathname.endsWith(`/invocations/${olderId}`)) await held;
    return fetchArchive(input, init);
  }));
  const screen = await render(createElement(App));
  try {
    await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
    const calls = screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button');
    await calls.nth(1).click();
    await calls.nth(0).click();
    await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
    release();
    await expect.poll(() => requests.includes(`/api/sessions/${sessionId}/invocations/${olderId}`)).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(screen.container.querySelector('.decision-title h2 span')?.textContent).toBe('latest');
    expect(location.search).toContain(`invocation=${latestId}`);
  } finally { release(); await screen.unmount(); }
});

test('unmount stops polling and ignores an unfinished archive load', async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requests = stubArchive({ hold: held });
  const screen = await render(createElement(App));
  await screen.unmount(); release();
  await new Promise(resolve => setTimeout(resolve, 2100));
  expect(requests).toEqual(['/api/sessions']);
});
