import { createElement } from 'react';
import '../../src/components.css';
import '../../../web/theme.css';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import App from '../../src/App.js';
import { makeView } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

const sessionId = 'a'.repeat(64), latestId = 'b'.repeat(64), olderId = 'c'.repeat(64);
const sessions = [{ id: sessionId, sessionId: 'offline-session', projects: ['/offline'], timestamp: 200, started: 100,
  invocations: 2, concerns: 1, unavailable: 0, coverage: 'best-effort' }];
const calls = [
  { id: latestId, invocationId: 'latest', callId: 'latest', toolName: 'bash', timestamp: 200, updated: 200,
    actionPreview: { key: 'command', value: '<script>fictional()</script> echo 雪', shortened: true },
    decision: 'BLOCK', missing: [], failure: null, assessmentStatus: 'validated', mode: 'observe', permission: 'released', execution: 'unknown', categories: ['uncertainty', 'approval'] },
  { id: olderId, invocationId: 'older', callId: 'older', toolName: 'read', timestamp: 100, updated: 100,
    actionPreview: { key: 'path', value: 'src/billing/format.ts', shortened: false },
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

test('call rows show inert recorded previews and explicit shortening without eager detail', async () => {
  await page.viewport(1280, 900);
  const requests = stubArchive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  const list = screen.getByRole('navigation', { name: 'Invocations' });
  await expect.element(list.getByText('<script>fictional()</script> echo 雪', { exact: true })).toBeVisible();
  await expect.element(list.getByText('Preview shortened', { exact: true })).toBeVisible();
  await expect.element(list.getByText('src/billing/format.ts', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('.call-list script')).toBeNull();
  expect(requests.filter(path => path.includes('/invocations/'))).toEqual([`/api/sessions/${sessionId}/invocations/${latestId}`]);
  expect(location.href).not.toContain('fictional');
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
  await expect.element(screen.getByRole('region', { name: 'Recorded call facts' }).getByText('Successful', { exact: true })).toBeVisible();
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
  await screen.getByText('Session / archive', { exact: true }).click();
  await screen.getByRole('button', { name: 'Refresh archive' }).click();
  await expect.element(screen.getByRole('alert')).toBeVisible();
  expect(screen.container.querySelector('[role="alert"]')?.textContent).toContain('503');
  failing = false;
  await screen.getByRole('button', { name: 'Refresh archive' }).click();
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
});

test('direct category filter and partial reader coverage keep individual call links usable', async () => {
  await page.viewport(1280, 900);
  const requests = stubArchive({ partial: true });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  await expect.element(screen.getByText('Partial archive', { exact: true })).toBeVisible();
  await screen.getByText('Recording issues', { exact: true }).click();
  await expect.element(screen.getByText(/Reader coverage: 1 unsupported schema records \(1 newer\)/)).toBeVisible();
  await expect.element(screen.getByText(/restart the inspector process/)).toBeVisible();
  await screen.getByText('Recording issues', { exact: true }).click();
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('approval');
  await vi.waitFor(() => expect(screen.container.querySelectorAll('.call-row')).toHaveLength(1));
  expect(screen.container.querySelector('.explorer .uncertainty-groups')).toBeNull();
  expect(requests.some(path => path.endsWith('/groups'))).toBe(false);
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('uncertainty');
  await vi.waitFor(() => expect(screen.container.querySelectorAll('.call-row')).toHaveLength(2));
  await screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button').nth(1).click();
  await expect.element(screen.getByRole('region', { name: 'Recorded call facts' }).getByText('Successful', { exact: true })).toBeVisible();
  expect(location.search).toContain(`invocation=${olderId}`);
  await screen.getByRole('combobox', { name: 'Finding category' }).selectOptions('uncertainty');
  await vi.waitFor(() => expect(screen.container.querySelectorAll('.call-row')).toHaveLength(2));
});

test('small screens keep Calls with a direct filter and Selected call as distinct views', async () => {
  await page.viewport(390, 844);
  stubArchive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  await screen.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls' }).click();
  expect(getComputedStyle(screen.container.querySelector('.inspection')!).display).toBe('none');
  await expect.element(screen.getByRole('combobox', { name: 'Finding category' })).toBeVisible();
  expect(screen.container.querySelector('.repeated-uncertainty')).toBeNull();
  await screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button').nth(1).click();
  await expect.element(screen.getByRole('region', { name: 'Recorded call facts' }).getByText('Successful', { exact: true })).toBeVisible();
  expect((screen.container.querySelector('.workspace') as HTMLElement).dataset.mobileView).toBe('assessment');
  await screen.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Calls' }).click();
  await expect.element(screen.getByRole('navigation', { name: 'Invocations' })).toBeVisible();
});

test('empty filtered sessions retain the direct filter, reset and individual call navigation', async () => {
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
  await expect.element(screen.getByRole('combobox', { name: 'Finding category' })).toBeVisible();
  expect(screen.container.querySelector('.repeated-uncertainty')).toBeNull();
  await screen.getByRole('button', { name: 'Clear filter' }).click();
  await screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button').nth(0).click();
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(location.search).toContain(`invocation=${latestId}`);
  expect(requests.some(path => path.endsWith('/groups'))).toBe(false);
});


test('sidebar compacts proved displayed context while detail keeps overlapping findings', async () => {
  await page.viewport(1280, 900);
  stubArchive();
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  const row = screen.container.querySelector('.call-row[aria-pressed="true"]')!;
  expect(row.querySelectorAll('.status-chip')).toHaveLength(1);
  expect(row.querySelector('.call-mode')).toBeNull();
  expect(screen.container.querySelector('.displayed-context')?.textContent).toContain('Displayed calls: Observe mode. Not blocked by Tenet.');
  expect(row.querySelectorAll('.call-concern')).toHaveLength(1);
  expect(row.querySelector('.call-concern')?.textContent).toContain('Approval condition +1');
  expect(screen.container.querySelector('[data-fact="findings"]')?.textContent).toContain('Approval condition');
  expect(screen.container.querySelector('[data-fact="findings"]')?.textContent).toContain('Assessment uncertainty');
});

for (const [execution, permission, result, permissionLabel] of [
  ['executed', 'released', 'Successful', 'Not blocked by Tenet'], ['failed', 'released', 'Failed', 'Not blocked by Tenet'],
  ['unknown', 'blocked', 'Unknown / not recorded', 'Blocked by Tenet'], ['unknown', 'released', 'Unknown / not recorded', 'Not blocked by Tenet'],
  ['unknown', 'unknown', 'Unknown / not recorded', 'Unknown'], ['executed', 'blocked', 'Successful', 'Blocked by Tenet'],
  ['failed', 'blocked', 'Failed', 'Blocked by Tenet'],
] as const) test(`list and summary preserve separate facts for ${execution}/${permission}`, async () => {
  await page.viewport(1280, 900);
  stubArchive({ status: { execution, permission } });
  const screen = await render(createElement(App));
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('[data-list-fact="result"]')?.textContent?.trim()).toBe(result);
  expect(screen.container.querySelector('[data-fact="result"]')?.textContent).toBe(result);
  expect(screen.container.querySelector('[data-fact="permission"]')?.textContent).toBe(permissionLabel);
  if (permission !== 'released' || execution === 'failed') {
    expect(screen.container.querySelector('[data-list-fact="permission"]')?.textContent?.trim()).toBe(permissionLabel);
    expect(screen.container.querySelector('.call-mode')?.textContent).toBe('Observe');
  } else expect(screen.container.querySelector('.displayed-context')?.textContent).toContain('Observe mode. Not blocked by Tenet.');
  const contradictory = permission === 'blocked' && execution !== 'unknown';
  expect(screen.container.querySelectorAll('.recording-inconsistency').length).toBe(contradictory ? 2 : 0);
  expect(screen.container.querySelectorAll('.call-row[aria-pressed="true"] .call-concern')).toHaveLength(1);
  if (contradictory) expect(screen.container.querySelector('.primary-status .recording-inconsistency')?.textContent).toContain(`execution is ${execution}`);
});
