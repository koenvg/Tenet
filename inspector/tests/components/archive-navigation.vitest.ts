import { afterEach, expect, test, vi } from 'vitest';
import { createArchiveNavigation } from '../../src/archive-navigation.js';
import { ruleUIFixture, session, other, rule, invocation, older, revision, common } from './rule-ui-fixture.js';
import { makeView } from './fixtures.js';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); history.replaceState(null, '', location.pathname); });
async function start() {
  const f = ruleUIFixture(), archive = createArchiveNavigation(), stop = archive.start(); cleanups.push(stop);
  await expect.poll(() => archive.getSnapshot().rules?.revision).toBe(revision);
  return { ...f, archive, stop };
}
const exact = (archive: ReturnType<typeof createArchiveNavigation>, id = invocation) => { const record = archive.getSnapshot().openRecords[id]; return record?.state === 'available' ? record.view : undefined; };

test('superseded exact reads abort and reject stale success and busy state', async () => {
  const f = await start(), held = deferred<Response>();
  f.intercept(url => url.pathname.endsWith(older) ? held.promise : undefined);
  const loading = f.archive.selectInvocation(older);
  await expect.poll(() => f.requests.at(-1)?.url.pathname.endsWith(older)).toBe(true);
  const request = f.requests.at(-1)!;
  await f.archive.selectInvocation(invocation);
  const snapshot = f.archive.getSnapshot(); expect(request.signal.aborted).toBe(true);
  held.resolve(Response.json({ ...common, view: makeView({ callId: 'older' }) })); await loading;
  expect(f.archive.getSnapshot()).toBe(snapshot);
  expect(exact(f.archive)?.identity?.callId).toBe('exact');
  expect(location.search).toContain(`invocation=${invocation}`);
});

test('session navigation cancels a refresh and rejects stale failure', async () => {
  const f = await start(), held = deferred<Response>();
  f.intercept(url => url.pathname === '/api/sessions' ? held.promise : undefined);
  const refresh = f.archive.refreshArchive(), request = f.requests.at(-1)!;
  f.intercept(() => undefined); await f.archive.selectSession(other);
  expect(request.signal.aborted).toBe(true);
  const snapshot = f.archive.getSnapshot(); held.resolve(new Response('{}', { status: 503 })); await refresh;
  expect(f.archive.getSnapshot()).toBe(snapshot);
  expect(snapshot.session).toBe(other); expect(snapshot.error).toBe('');
});

test('refresh publishes one complete matching revision and preserves unchanged exact objects', async () => {
  const f = await start(); await f.archive.selectRule(rule); await f.archive.selectInvocation(invocation);
  const original = f.archive.getSnapshot(), view = exact(f.archive), count = f.requests.filter(r => r.url.pathname.includes('/invocations/')).length;
  await f.archive.refreshArchive();
  expect(f.archive.getSnapshot()).toMatchObject({ rules: original.rules, selected: original.selected, checks: original.checks });
  expect(f.archive.getSnapshot().rules).toBe(original.rules); expect(f.archive.getSnapshot().checks).toBe(original.checks);
  expect(f.requests.filter(r => r.url.pathname.includes('/invocations/'))).toHaveLength(count);
  expect(exact(f.archive)).toBe(view);
});

test('stop aborts pending work and blocks transport and publication; restart rejects earlier mount', async () => {
  const f = await start(), held = deferred<Response>();
  f.intercept(() => held.promise); const loading = f.archive.selectInvocation(older), request = f.requests.at(-1)!;
  f.stop(); expect(request.signal.aborted).toBe(true);
  const stopped = f.archive.getSnapshot(), count = f.requests.length;
  await f.archive.selectInvocation(invocation); await f.archive.refreshArchive();
  expect(f.requests).toHaveLength(count); expect(f.archive.getSnapshot()).toBe(stopped);
  f.intercept(() => undefined); history.replaceState(null, '', location.pathname);
  const stop = f.archive.start(); cleanups.push(stop);
  await expect.poll(() => f.archive.getSnapshot().rules?.revision).toBe(revision);
  await expect.poll(() => f.archive.getSnapshot().panel.kind).toBe('closed');
  const restarted = f.archive.getSnapshot(); held.resolve(new Response('{}', { status: 503 })); await loading;
  expect(f.archive.getSnapshot()).toBe(restarted);
});

test('session page metadata cannot replace selected-session issues', async () => {
  const f = await start(), issue = { file: 'selected.json', reason: 'corrupt' };
  f.intercept(url => Promise.resolve(Response.json({ ...common, ...f.data(url), issues: url.pathname === '/api/sessions' ? [{ file: 'other.json', reason: 'corrupt' }] : [issue] })));
  await f.archive.loadRules(); await f.archive.loadSessions('second-page');
  expect(f.archive.getSnapshot().issues).toEqual([issue]);
});

test('abort-aware canceled exact reads do not report errors', async () => {
  const f = await start();
  f.intercept((url, init) => url.pathname.endsWith(older) ? new Promise((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true }); }) : undefined);
  const loading = f.archive.selectInvocation(older); await f.archive.selectInvocation(invocation); await loading;
  expect(f.archive.getSnapshot().error).toBe(''); expect(exact(f.archive)?.identity?.callId).toBe('exact');
});

test('unchanged polling preserves snapshot and stop removes timer and history listener', async () => {
  let poll!: () => Promise<void>; vi.stubGlobal('setInterval', vi.fn(callback => { poll = callback; return 1; }));
  const clear = vi.fn(); vi.stubGlobal('clearInterval', clear);
  const f = await start(), snapshot = f.archive.getSnapshot();
  await poll(); expect(f.archive.getSnapshot()).toBe(snapshot);
  f.stop(); const count = f.requests.length; poll(); window.dispatchEvent(new PopStateEvent('popstate'));
  expect(f.requests).toHaveLength(count); expect(clear).toHaveBeenCalledWith(1);
});

for (const read of ['rules', 'panel', 'action'] as const) test(`session changes reject stale ${read} publication`, async () => {
  const f = await start(), held = deferred<Response>();
  f.intercept(url => url.pathname.startsWith(`/api/sessions/${session}`) ? held.promise : undefined);
  const loading = read === 'action' ? f.archive.selectInvocation(older) : read === 'panel' ? f.archive.selectRule(rule) : f.archive.loadRules();
  await expect.poll(() => f.requests.at(-1)?.url.pathname.startsWith(`/api/sessions/${session}`)).toBe(true);
  const request = f.requests.at(-1)!; await f.archive.selectSession(other);
  const snapshot = f.archive.getSnapshot(); expect(request.signal.aborted).toBe(true);
  held.resolve(Response.json({ ...common, ...f.data(request.url) })); await loading;
  expect(f.archive.getSnapshot()).toBe(snapshot);
});

test('old invocation links load despite missing rule inventory, without selecting another record', async () => {
  history.replaceState(null, '', `?session=${session}&invocation=${older}`);
  const f = ruleUIFixture(); f.intercept(url => url.pathname.endsWith('/rules') ? Promise.resolve(new Response('{}', { status: 404 })) : undefined);
  const archive = createArchiveNavigation(); cleanups.push(archive.start());
  await expect.poll(() => exact(archive, older)?.identity?.callId).toBe('older');
  expect(f.requests.some(r => r.url.pathname.endsWith(`/invocations/${invocation}`))).toBe(false);
  expect(archive.getSnapshot().openRecords[older]).toMatchObject({ state: 'available', sourceRevision: null });
  expect(location.search).toBe(`?session=${session}&invocation=${older}`);
});

test('409 retries are bounded and failed revisions never publish a mixed summary', async () => {
  const f = await start(), original = f.archive.getSnapshot(); let stale = 0;
  f.intercept(url => url.pathname.endsWith('/rules') ? (stale++, Promise.resolve(new Response('{}', { status: 409 }))) : undefined);
  await f.archive.refreshArchive();
  expect(stale).toBe(2); expect(f.archive.getSnapshot().rules).toBe(original.rules);
  expect(f.archive.getSnapshot().error).toContain('reconnecting');
  f.intercept(() => undefined); await f.archive.refreshArchive(); expect(f.archive.getSnapshot().error).toBe('');
});

test('closing a deep-linked panel is permanent across unchanged polls', async () => {
  const f = await start(); await f.archive.selectRule(rule); await f.archive.selectInvocation(invocation);
  f.archive.closePanel(); const url = location.href; await f.archive.refreshArchive();
  expect(f.archive.getSnapshot().panel).toEqual({ kind: 'closed' }); expect(location.href).toBe(url);
});


test('dismissed withdrawn exact action cannot veto a later violation or trigger retired reads', async () => {
  const newer = ruleUIFixture({ status: 'violation' });
  const f = await start(); await f.archive.selectRule(rule); await f.archive.selectInvocation(invocation); f.archive.closePanel();
  const count = f.requests.filter(r => r.url.pathname.includes('/invocations/')).length;
  f.intercept(url => Promise.resolve(url.pathname.includes('/invocations/') ? new Response('{}', { status: 404 }) : Response.json({ ...common, ...newer.data(url) })));
  await f.archive.refreshArchive(); await f.archive.refreshArchive();
  expect(f.archive.getSnapshot().rules?.status).toBe('violation');
  expect(f.requests.filter(r => r.url.pathname.includes('/invocations/'))).toHaveLength(count);
});

test('first lazy exact read recovers a source advance before publishing matching rule and check facts', async () => {
  const next = ruleUIFixture({ status: 'violation' });
  const f = await start(); await f.archive.selectRule(rule); const held = deferred<Response>(); let advanced = false;
  f.intercept(url => {
    if (url.pathname.includes('/invocations/') && !advanced) return held.promise;
    if (advanced && url.searchParams.get('revision') === revision) return Promise.resolve(new Response('{}', { status: 409 }));
    const value = next.data(url) as any;
    return advanced ? Promise.resolve(Response.json({ ...common, ...value, revision: 'new', ...(url.pathname.includes('/invocations/') ? { view: makeView({ callId: 'revision-B', choice: 'FAIL' }) } : {}), ...(value?.sessions ? { sessions: value.sessions.map((s: any) => ({ ...s, revision: 'new' })) } : {}) })) : undefined;
  });
  const publications: unknown[] = [];
  cleanups.push(f.archive.subscribe(() => {
    const state = f.archive.getSnapshot(), view = exact(f.archive);
    if (view) publications.push([state.rules?.revision, state.selected?.rule.status, state.checks?.items[0]?.outcome, view.rules[0]?.result?.outcome?.choice]);
  }));
  const loading = f.archive.selectInvocation(invocation);
  await expect.poll(() => f.requests.at(-1)?.url.pathname.includes('/invocations/')).toBe(true); advanced = true;
  held.resolve(Response.json({ ...common, view: makeView({ callId: 'revision-B' }) })); await loading;
  expect(f.archive.getSnapshot().rules?.revision).toBe('new');
  expect(f.archive.getSnapshot().selected?.rule.status).toBe('violation');
  expect(f.archive.getSnapshot().checks?.items[0]?.outcome).toBe('FAIL');
  expect(exact(f.archive)?.identity?.callId).toBe('revision-B'); expect(exact(f.archive)?.rules[0]?.result?.outcome?.choice).toBe('FAIL');
  expect(f.archive.getSnapshot().openRecords[invocation]).toMatchObject({ state: 'available', sourceRevision: 'new' });
  expect(publications).toEqual([['new', 'violation', 'FAIL', 'FAIL']]);
});

test('filtered session continuation restarts by replacement and keeps selected session independent', async () => {
  const f = await start(), original = f.archive.getSnapshot().rules;
  f.archive.filterProjects('/fixture'); await expect.poll(() => f.archive.getSnapshot().session).toBe('');
  await f.archive.selectSession(session);
  const removed = '1'.repeat(64), updated = '2'.repeat(64), extra = '3'.repeat(64);
  const rows = Array.from({ length: 55 }, (_, i) => ({ ...f.rows[0], id: i === 0 ? updated : i === 1 ? removed : String(i + 10).padStart(64, '0'), status: 'clear' }));
  f.intercept(url => url.pathname === '/api/sessions' ? Promise.resolve(Response.json({ ...common, sessions: rows.slice(0, 50), next: 'old-cursor' })) : undefined);
  await f.archive.loadSessions();
  f.intercept(url => {
    if (url.pathname !== '/api/sessions') return undefined;
    if (url.searchParams.has('cursor')) return Promise.resolve(new Response('{}', { status: 409 }));
    const filtered = [{ ...rows[0], status: 'violation' }, ...rows.slice(2)];
    return Promise.resolve(Response.json({ ...common, sessions: url.searchParams.get('project') === '/fixture' ? filtered.slice(0, 50) : [{ ...f.rows[1], id: extra }], next: 'new-cursor' }));
  });
  await f.archive.loadSessions('old-cursor');
  expect(f.archive.getSnapshot().sessions.find(s => s.id === updated)?.status).toBe('violation');
  expect(f.archive.getSnapshot().sessions.some(s => s.id === removed || s.id === extra)).toBe(false);
  expect(new Set(f.archive.getSnapshot().sessions.map(s => s.id)).size).toBe(50);
  expect(f.archive.getSnapshot().nextSession).toBe('new-cursor');
  expect(f.requests.filter(r => r.url.pathname === '/api/sessions').at(-1)?.url.searchParams.get('project')).toBe('/fixture');
  expect(f.archive.getSnapshot().session).toBe(session); expect(f.archive.getSnapshot().rules).toEqual(original);
});

for (const failure of [503, 409]) test(`check continuation recovery ${failure} is contained with an honest stale notice`, async () => {
  const f = await start();
  f.intercept(url => url.pathname.endsWith('/checks') ? Promise.resolve(Response.json({ ...common, ...f.data(url), items: Array.from({ length: 50 }, (_, i) => ({ ...(f.data(url) as any).items[0], id: String(i) })), next: 'old' })) : undefined);
  await f.archive.selectRule(rule); const original = f.archive.getSnapshot().checks;
  f.intercept(url => Promise.resolve(new Response('{}', { status: url.pathname.endsWith('/checks') ? 409 : failure })));
  const before = f.requests.length;
  await expect(f.archive.loadChecks()).resolves.toBeUndefined();
  expect(f.archive.getSnapshot().checks).toBe(original);
  expect(f.archive.getSnapshot().error).toContain('reconnecting'); expect(f.archive.getSnapshot().panelBusy).toBe(false);
  expect(f.requests.length - before).toBe(failure === 409 ? 3 : 2);
});


test('visible withdrawn action and unavailable selected destination stay local while summaries advance', async () => {
  const newer = ruleUIFixture({ status: 'violation' }); const f = await start();
  await f.archive.selectRule(rule); await f.archive.selectInvocation(invocation);
  f.intercept(url => {
    if (url.pathname.includes('/invocations/')) return Promise.resolve(new Response('{}', { status: 404 }));
    const value = newer.data(url) as any;
    return Promise.resolve(Response.json({ ...common, ...value, revision: 'next', ...(value?.sessions ? { sessions: value.sessions.map((row: any) => ({ ...row, revision: 'next' })) } : {}) }));
  });
  await f.archive.refreshArchive();
  expect(f.archive.getSnapshot().rules?.status).toBe('violation');
  expect(f.archive.getSnapshot().openRecords[invocation]).toMatchObject({ state: 'unavailable', sourceRevision: 'next' });
  const reads = f.requests.filter(r => r.url.pathname.includes('/invocations/')).length;
  await f.archive.loadRules(); expect(f.requests.filter(r => r.url.pathname.includes('/invocations/'))).toHaveLength(reads);
  f.intercept(url => url.pathname.includes('/rules/') ? Promise.resolve(new Response('{}', { status: 404 })) : Promise.resolve(Response.json({ ...common, ...newer.data(url) })));
  await f.archive.refreshArchive();
  expect(f.archive.getSnapshot().rules?.status).toBe('violation'); expect(f.archive.getSnapshot().selected).toBeNull();
  expect(f.archive.getSnapshot().panelError).toContain('Recorded rule unavailable'); expect(f.archive.getSnapshot().openRecords[invocation]).toMatchObject({ state: 'available', sourceRevision: revision });
});

test('open disclosures retain at most eight exact views and closing releases retention and read ownership', async () => {
  const f = await start(), ids = Array.from({ length: 10 }, (_, i) => String(i).padStart(64, '0'));
  f.intercept(url => url.pathname.endsWith('/checks') ? Promise.resolve(Response.json({ ...common, ...f.data(url), items: ids.map(id => ({ ...(f.data(url) as any).items[0], id, invocation: id })) })) : undefined);
  await f.archive.selectRule(rule);
  for (const id of ids.slice(0, 9)) await f.archive.selectInvocation(id);
  expect(Object.values(f.archive.getSnapshot().openRecords).filter(r => r.state === 'available')).toHaveLength(8);
  expect(f.archive.getSnapshot().openRecords[ids[8]!]).toMatchObject({ state: 'unavailable', reason: 'Visible record limit reached (8 records / 32 MiB). Close another recorded action and retry.' });
  const first = exact(f.archive, ids[0]), reads = f.requests.filter(r => r.url.pathname.includes('/invocations/')).length;
  expect(reads).toBe(8);
  await f.archive.loadRules(); expect(exact(f.archive, ids[0])).toBe(first);
  expect(f.requests.filter(r => r.url.pathname.includes('/invocations/'))).toHaveLength(reads);
  f.archive.closeInvocation(ids[0]!); await f.archive.selectInvocation(ids[8]!);
  expect(f.archive.getSnapshot().openRecords[ids[0]!]).toBeUndefined(); expect(exact(f.archive, ids[8])?.identity?.callId).toBe('exact');
  expect(Object.values(f.archive.getSnapshot().openRecords).filter(r => r.state === 'available')).toHaveLength(8);
  f.archive.closePanel(); expect(f.archive.getSnapshot().openRecords).toEqual({});
});

test('serialized visible exact views stay within 32 MiB without evicting mounted views', async () => {
  const f = await start();
  f.intercept(url => url.pathname.includes('/invocations/') ? Promise.resolve(Response.json({ ...common, view: { ...makeView(), evidence: { text: 'x'.repeat(17 * 1024 * 1024) } } })) : undefined);
  await f.archive.selectRule(rule); await f.archive.selectInvocation(invocation); const first = exact(f.archive);
  await f.archive.selectInvocation(older);
  expect(exact(f.archive)).toBe(first);
  expect(f.archive.getSnapshot().openRecords[older]).toMatchObject({ state: 'unavailable', reason: 'Visible record limit reached (8 records / 32 MiB). Close another recorded action and retry.' });
  const bytes = Object.values(f.archive.getSnapshot().openRecords).reduce((sum, r) => sum + (r.state === 'available' ? r.bytes : 0), 0);
  expect(bytes).toBeLessThanOrEqual(32 * 1024 * 1024); expect(first?.identity?.callId).toBe('offline-call');
});
