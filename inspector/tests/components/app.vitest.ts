import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import App from '../../src/App.svelte';
import { makeView } from './fixtures.js';
import '../../src/style.css';
import '../../src/summary.css';

const sessionId = 'a'.repeat(64), latestId = 'b'.repeat(64), olderId = 'c'.repeat(64);
const sessions = [{ id: sessionId, sessionId: 'offline-session', projects: ['/offline'], timestamp: 200, started: 100,
  invocations: 2, concerns: 1, unavailable: 0, coverage: 'best-effort' }];
const calls = [
  { id: latestId, invocationId: 'latest', callId: 'latest', toolName: 'bash', timestamp: 200, updated: 200,
    decision: 'BLOCK', missing: [], failure: null, assessmentStatus: 'validated', mode: 'observe', permission: 'blocked', execution: 'unknown' },
  { id: olderId, invocationId: 'older', callId: 'older', toolName: 'read', timestamp: 100, updated: 100,
    decision: 'ALLOW', missing: [], failure: null, assessmentStatus: 'validated', mode: 'observe', permission: 'released', execution: 'executed' },
];

function stubArchive(options: { fail?: () => boolean; hold?: Promise<void> } = {}) {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw new Error(`Unexpected request ${url}`);
    if (init?.headers && 'Authorization' in init.headers) throw new Error('Unexpected authorization');
    const data = url.pathname === '/api/sessions' ? { sessions, next: null }
      : url.pathname === `/api/sessions/${sessionId}` ? { invocations: calls, next: null }
      : url.pathname === `/api/sessions/${sessionId}/invocations/${latestId}` ? { view: makeView({ callId: 'latest' }) }
      : url.pathname === `/api/sessions/${sessionId}/invocations/${olderId}` ? { view: makeView({ callId: 'older', decision: 'ALLOW', gate: null, execution: 'executed' }) }
      : null;
    if (!data) throw new Error(`Unexpected API route ${url.pathname}`);
    requests.push(url.pathname);
    if (options.hold && url.pathname === '/api/sessions') await options.hold;
    if (options.fail?.()) return new Response('{}', { status: 503 });
    return Response.json({ ...data, issues: [], captureHealth: [] });
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
  const screen = await render(App);
  await expect.element(screen.getByRole('region', { name: 'Decision summary' })).toBeVisible();
  expect(screen.container.querySelector('.call-row[aria-pressed="true"] .call-id')?.textContent).toBe('latest');
  expect(screen.container.querySelector('.decision-title h2 span')?.textContent).toBe('latest');
  expect(requests).toContain(`/api/sessions/${sessionId}/invocations/${latestId}`);
  expect(location.search).toContain(`invocation=${latestId}`);
  await screen.getByRole('navigation', { name: 'Invocations' }).getByRole('button').nth(1).click();
  await expect.element(screen.getByText('Actual execution / Ran')).toBeVisible();
  expect(screen.container.querySelector('.decision-title h2 span')?.textContent).toBe('older');
  expect(location.search).toContain(`invocation=${olderId}`);
  expect(requests).toContain(`/api/sessions/${sessionId}/invocations/${olderId}`);
});

test('a deep link selects the requested call instead of the newest', async () => {
  history.replaceState(null, '', `?session=${sessionId}&invocation=${olderId}`);
  const requests = stubArchive();
  const screen = await render(App);
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
  const screen = await render(App);
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
