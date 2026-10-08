import { afterEach, expect, test, vi } from 'vitest';
import { createArchiveNavigation } from '../../src/archive-navigation.js';
import { makeView } from './fixtures.js';

const session = 'a'.repeat(64), otherSession = 'd'.repeat(64);
const latest = 'b'.repeat(64), older = 'c'.repeat(64);
const sessions = [{ id: session, projects: ['/offline'], timestamp: 200 }];
const calls = [{ id: latest }, { id: older }];
const reader = { build: 'fixture', supportedSchemas: [5], unsupported: 0, newerUnsupported: 0, corrupt: 0, indexing: false, otherIssues: 0 };
const envelope = { issues: [], captureHealth: [], reader, next: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const requests: { url: URL; signal: AbortSignal; result: Promise<Response> }[] = [];
  let intercept: (url: URL, signal: AbortSignal) => Promise<Response> | undefined = () => undefined;
  const transport = vi.fn((path: string, init: RequestInit) => {
    const url = new URL(path, location.href);
    expect(url.origin).toBe(location.origin);
    expect(url.pathname.startsWith('/api/')).toBe(true);
    expect(url.pathname.endsWith('/groups')).toBe(false);
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('same-origin');
    expect(init.mode).toBe('same-origin');
    const data = url.pathname === '/api/sessions' ? { sessions }
      : url.pathname.includes('/invocations/') ? { view: makeView({ callId: url.pathname.endsWith(older) ? 'older' : 'latest' }) }
      : { invocations: calls };
    // Deliberately ignore abort here: a completed transport must still be rejected by the controller.
    const result = intercept(url, init.signal as AbortSignal) ?? Promise.resolve(Response.json({ ...envelope, ...data }));
    requests.push({ url, signal: init.signal as AbortSignal, result });
    return result;
  });
  vi.stubGlobal('fetch', transport);
  const archive = createArchiveNavigation();
  const stop = archive.start();
  return { archive, requests, stop, intercept: (handler: typeof intercept) => { intercept = handler; } };
}
async function ready(archive: ReturnType<typeof createArchiveNavigation>) {
  await expect.poll(() => archive.getSnapshot().view?.identity?.callId).toBe('latest');
}
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(stop => stop());
  vi.unstubAllGlobals();
  history.replaceState(null, '', location.pathname);
});
function start() {
  const f = fixture(); cleanups.push(f.stop); return f;
}

test('superseded detail reads abort and cannot publish stale success or busy state', async () => {
  const f = start(); await ready(f.archive);
  const held = deferred<Response>();
  f.intercept(url => url.pathname.endsWith(older) ? held.promise : undefined);
  const oldRead = f.archive.selectInvocation(older);
  const request = f.requests.at(-1)!;
  await f.archive.selectInvocation(latest);
  expect(request.signal.aborted).toBe(true);
  const snapshot = f.archive.getSnapshot();
  held.resolve(Response.json({ ...envelope, view: makeView({ callId: 'older' }) }));
  await oldRead;
  expect(f.archive.getSnapshot()).toBe(snapshot);
  expect(location.search).toContain(`invocation=${latest}`);
});

test('session navigation cancels a refresh and rejects its stale failure', async () => {
  const f = start(); await ready(f.archive);
  const held = deferred<Response>();
  f.intercept(url => url.pathname === '/api/sessions' ? held.promise : undefined);
  const refresh = f.archive.refreshArchive();
  const request = f.requests.at(-1)!;
  await f.archive.selectSession(otherSession);
  expect(request.signal.aborted).toBe(true);
  held.resolve(new Response('{}', { status: 503 })); await refresh;
  expect(f.archive.getSnapshot().session).toBe(otherSession);
  expect(f.archive.getSnapshot().error).toBe('');
});

test('refresh publishes only a completed snapshot and leaves unchanged data mounted', async () => {
  const f = start(); await ready(f.archive);
  const original = f.archive.getSnapshot();
  const held = deferred<Response>();
  f.intercept(url => url.pathname.includes('/invocations/') ? held.promise : url.pathname === '/api/sessions'
    ? Promise.resolve(Response.json({ ...envelope, sessions: [...sessions, { id: otherSession, projects: ['/second'] }] })) : undefined);
  const refresh = f.archive.refreshArchive();
  await expect.poll(() => f.requests.at(-1)?.url.pathname.includes('/invocations/')).toBe(true);
  expect(f.archive.getSnapshot().sessions).toBe(original.sessions);
  expect(f.archive.getSnapshot().view).toBe(original.view);
  held.resolve(Response.json({ ...envelope, view: original.view })); await refresh;
  expect(f.archive.getSnapshot().sessions).toHaveLength(2);
  expect(f.archive.getSnapshot().view).toBe(original.view);
});

test('stop aborts pending refresh and blocks publication and subsequent transport', async () => {
  const f = start(); await ready(f.archive);
  const held = deferred<Response>();
  f.intercept(() => held.promise);
  const refresh = f.archive.refreshArchive();
  const request = f.requests.at(-1)!;
  f.stop();
  expect(request.signal.aborted).toBe(true);
  const stopped = f.archive.getSnapshot(), count = f.requests.length;
  held.resolve(Response.json({ ...envelope, sessions: [] })); await refresh;
  await f.archive.selectInvocation(older);
  await f.archive.refreshArchive();
  expect(f.requests).toHaveLength(count);
  expect(f.archive.getSnapshot()).toBe(stopped);
});

test('restart cannot be changed by completions from an earlier mount', async () => {
  const f = start(); await ready(f.archive);
  const held = deferred<Response>();
  f.intercept(url => url.pathname.endsWith(older) ? held.promise : undefined);
  const oldRead = f.archive.selectInvocation(older);
  f.stop();
  history.replaceState(null, '', location.pathname);
  const stop = f.archive.start(); cleanups.push(stop);
  await ready(f.archive);
  const restarted = f.archive.getSnapshot();
  held.resolve(new Response('{}', { status: 503 })); await oldRead;
  expect(f.archive.getSnapshot()).toBe(restarted);
});

test('loading session pages cannot replace selected-session warnings', async () => {
  const f = start(); await ready(f.archive);
  const selectedIssue = { file: 'selected.json', reason: 'corrupt' };
  f.intercept(url => Promise.resolve(Response.json({ ...envelope, ...(url.pathname === '/api/sessions'
    ? { sessions, issues: [{ file: 'other.json', reason: 'corrupt' }] }
    : { invocations: calls, issues: [selectedIssue] }) })));
  await f.archive.loadTimeline();
  await f.archive.loadSessions('page-2');
  expect(f.archive.getSnapshot().issues).toEqual([selectedIssue]);
});


test('abort-aware transport reports no error for a canceled read', async () => {
  const f = start(); await ready(f.archive);
  f.intercept((url, signal) => url.pathname.endsWith(older) ? new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true });
  }) : undefined);
  const canceled = f.archive.selectInvocation(older);
  await f.archive.selectInvocation(latest); await canceled;
  expect(f.archive.getSnapshot().error).toBe('');
  expect(f.archive.getSnapshot().view?.identity?.callId).toBe('latest');
});

test('unchanged polling preserves the snapshot and stop removes polling and URL listeners', async () => {
  let poll!: () => Promise<void> | void;
  vi.stubGlobal('setInterval', vi.fn((callback: typeof poll) => { poll = callback; return 1; }));
  const clear = vi.fn(); vi.stubGlobal('clearInterval', clear);
  const f = start(); await ready(f.archive);
  const snapshot = f.archive.getSnapshot();
  await poll();
  expect(f.requests).toHaveLength(6);
  expect(f.archive.getSnapshot()).toBe(snapshot);
  await f.archive.refreshArchive();
  expect(f.archive.getSnapshot().view).toBe(snapshot.view);
  f.stop();
  const count = f.requests.length;
  poll(); window.dispatchEvent(new PopStateEvent('popstate'));
  expect(f.requests).toHaveLength(count);
  expect(clear).toHaveBeenCalledWith(1);
});

for (const read of ['timeline', 'detail'] as const) test(`session changes cancel stale ${read} publication`, async () => {
  const f = start(); await ready(f.archive);
  const held = deferred<Response>();
  f.intercept(url => url.pathname === `/api/sessions/${session}${read === 'detail' ? `/invocations/${older}` : ''}` ? held.promise : undefined);
  const loading = read === 'detail' ? f.archive.selectInvocation(older) : f.archive.loadTimeline();
  const request = f.requests.at(-1)!;
  await f.archive.selectSession(otherSession);
  const snapshot = f.archive.getSnapshot();
  expect(request.signal.aborted).toBe(true);
  held.resolve(Response.json({ ...envelope, invocations: [], view: makeView({ callId: 'older' }), issues: [{ file: 'old', reason: 'corrupt' }] }));
  await loading;
  expect(f.archive.getSnapshot()).toBe(snapshot);
});

test('a newer category load cancels the old timeline and keeps the selected call', async () => {
  const f = start(); await ready(f.archive);
  const held = deferred<Response>();
  f.intercept(url => url.pathname === `/api/sessions/${session}` && !url.searchParams.has('category') ? held.promise : undefined);
  const loading = f.archive.loadTimeline('old-page');
  const request = f.requests.at(-1)!;
  f.archive.filterCategory('uncertainty');
  await expect.poll(() => f.archive.getSnapshot().timelineBusy).toBe(false);
  const snapshot = f.archive.getSnapshot();
  expect(request.signal.aborted).toBe(true);
  held.resolve(Response.json({ ...envelope, invocations: [] })); await loading;
  expect(f.archive.getSnapshot()).toBe(snapshot);
  expect(snapshot.invocation).toBe(latest);
  expect(snapshot.category).toBe('uncertainty');
});


test('deep links load the requested call despite a timeline failure and retain it on refresh', async () => {
  history.replaceState(null, '', `?session=${session}&invocation=${older}`);
  const f = start();
  let failTimeline = true;
  f.intercept(url => {
    if (url.pathname === `/api/sessions/${session}` && failTimeline) {
      failTimeline = false;
      return Promise.resolve(new Response('{}', { status: 503 }));
    }
  });
  await expect.poll(() => f.archive.getSnapshot().view?.identity?.callId).toBe('older');
  expect(f.requests.some(request => request.url.pathname.endsWith(`/invocations/${older}`))).toBe(true);
  expect(f.requests.some(request => request.url.pathname.endsWith(`/invocations/${latest}`))).toBe(false);
  expect(f.archive.getSnapshot().invocations).toEqual([]);
  await f.archive.refreshArchive();
  expect(f.archive.getSnapshot().invocations).toEqual(calls);
  expect(f.archive.getSnapshot().invocation).toBe(older);
  expect(f.archive.getSnapshot().view?.identity?.callId).toBe('older');
  expect(f.archive.getSnapshot().error).toBe('');
  expect(location.search).toBe(`?session=${session}&invocation=${older}`);
});
