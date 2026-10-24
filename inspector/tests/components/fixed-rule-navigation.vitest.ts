import { afterEach, expect, test, vi } from 'vitest';
import { createArchiveNavigation } from '../../src/archive-navigation.js';
import { fixedRuleFixture, fixedWording } from './fixed-rule-fixture.js';
import { session, other, rule, invocation, revision } from './rule-ui-fixture.js';
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); history.replaceState(null, '', location.pathname); });
function start(f = fixedRuleFixture(), search = `?view=fixed-rule&session=${session}`) {
  history.replaceState(null, '', search);
  const archive = createArchiveNavigation(); cleanups.push(archive.start());
  return { ...f, archive };
}
const availability = (f: ReturnType<typeof start>) => f.archive.getSnapshot().fixedRule;

for (const qualified of [false, true]) for (const recovery of ['manual', 'poll'] as const) test(`${qualified ? 'qualified' : 'bare'} fixed URL survives initial metadata failure and ${recovery} recovery`, async () => {
  let poll!: () => Promise<void>;
  vi.stubGlobal('setInterval', vi.fn(callback => { poll = callback; return 1; }));
  const f = fixedRuleFixture(), search = `?view=fixed-rule${qualified ? `&session=${other}` : ''}`;
  f.intercept(url => Promise.resolve(url.pathname === '/api/sessions' ? new Response('{}', { status: 503 }) : Response.json(f.fixedData(url))));
  const running = start(f, search);
  await expect.poll(() => running.archive.getSnapshot().error).toBe('Archive request failed: 503. Try refreshing.');
  expect(running.archive.getSnapshot().session).toBe(qualified ? other : '');
  expect(availability(running)).toEqual(qualified ? { kind: 'unavailable', revision: null, reason: 'Archive request failed: 503. Try refreshing.' } : { kind: 'choose-session' });
  expect(running.archive.getSnapshot().selected).toBeNull();
  expect(location.search).toBe(search);

  f.intercept(url => Promise.resolve(Response.json(f.fixedData(url))));
  if (recovery === 'manual') await running.archive.refreshArchive(); else await poll();
  expect(running.archive.getSnapshot().error).toBe('');
  expect(running.archive.getSnapshot().session).toBe(qualified ? other : '');
  expect(availability(running)).toEqual(qualified ? { kind: 'ready', revision, rule } : { kind: 'choose-session' });
  expect(location.search).toBe(search);
  if (qualified) {
    expect(running.archive.getSnapshot().selected?.session).toBe(other);
    expect(running.archive.getSnapshot().selected?.wording).toEqual({ state: 'available', text: 'Do not directly use write/edit tools. Delegate those actions.' });
  } else {
    expect(running.archive.getSnapshot().rules).toBeNull();
    expect(f.requests.map(request => request.url.pathname)).toEqual(['/api/sessions', '/api/sessions']);
  }
});

for (const qualified of [false, true]) for (const status of [200, 503]) test(`late ${status} startup metadata cannot override later explicit selection from a ${qualified ? 'qualified' : 'bare'} fixed URL`, async () => {
  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; }), f = fixedRuleFixture();
  let first = true;
  f.intercept(url => {
    if (first && url.pathname === '/api/sessions') { first = false; return held; }
    return Promise.resolve(Response.json(f.fixedData(url)));
  });
  const running = start(f, `?view=fixed-rule${qualified ? `&session=${session}` : ''}`);
  await expect.poll(() => f.requests.length).toBe(1);
  const request = f.requests[0]!;
  await running.archive.selectSession(other);
  expect(running.archive.getSnapshot().session).toBe(other);
  expect(availability(running)).toEqual({ kind: 'ready', revision, rule });
  expect(running.archive.getSnapshot().selected?.session).toBe(other);
  expect(request.signal.aborted).toBe(true);
  const current = running.archive.getSnapshot(), search = location.search;
  release(status === 200 ? Response.json(f.fixedData(request.url)) : new Response('{}', { status }));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(running.archive.getSnapshot()).toBe(current);
  expect(location.search).toBe(search);
  expect(new URLSearchParams(search).get('session')).toBe(other);
  expect(new URLSearchParams(search).get('view')).toBe('fixed-rule');
});

for (const [name, patch, reason] of [
  ['null preview', { preview: null }, 'Recorded wording is missing or conflicting. Exact rule identity cannot be established.'],
  ['conflicting declaration', { wordingConflict: true }, 'Recorded wording is missing or conflicting. Exact rule identity cannot be established.'],
  ['different preview', { preview: 'Delegate all work.' }, 'No declaration with this exact wording was found in the available recorded rules.'],
] as const) test(`fixed identity rejects ${name}`, async () => {
  const f = fixedRuleFixture();
  f.intercept(url => Promise.resolve(Response.json({ ...f.fixedData(url), ...(url.pathname.endsWith('/rules') ? { items: [{ ...f.item, ...patch, preview: 'preview' in patch ? patch.preview : fixedWording }] } : {}) })));
  const running = start(f);
  await expect.poll(() => availability(running)).toEqual({ kind: 'unavailable', revision, reason });
  expect(running.archive.getSnapshot().selected).toBeNull();
});

for (const wording of [{ state: 'available', text: `${fixedWording} ` }, { state: 'unavailable', reason: 'source-unavailable-or-changed' }]) test(`full wording ${wording.state} is required to prove exact identity`, async () => {
  const f = fixedRuleFixture();
  f.intercept(url => Promise.resolve(Response.json({ ...f.fixedData(url), ...(url.pathname.endsWith(`/rules/${rule}`) ? { wording } : {}) })));
  const running = start(f);
  await expect.poll(() => availability(running).kind).toBe('unavailable');
  expect(availability(running)).toEqual({ kind: 'unavailable', revision: wording.state === 'unavailable' ? null : revision, reason: wording.state === 'available' ? 'No declaration with this exact wording was found in the available recorded rules.' : 'Exact recorded wording is unavailable or conflicting.' });
  expect(running.requests.filter(r => r.url.pathname.endsWith(`/rules/${rule}`)).map(r => r.url.searchParams.get('revision'))).toEqual([revision]);
});

for (const recovery of ['manual', 'poll'] as const) test(`HTTP-200 source wording unavailability retries at the same revision on ${recovery} refresh`, async () => {
  let poll!: () => Promise<void>;
  vi.stubGlobal('setInterval', vi.fn(callback => { poll = callback; return 1; }));
  const f = fixedRuleFixture();
  f.intercept(url => Promise.resolve(Response.json({ ...f.fixedData(url), ...(url.pathname.endsWith(`/rules/${rule}`) ? { wording: { state: 'unavailable', reason: 'source-unavailable-or-changed' } } : {}) })));
  const running = start(f), published: unknown[] = [];
  cleanups.push(running.archive.subscribe(() => {
    const state = running.archive.getSnapshot();
    if (state.fixedRule.kind === 'ready') published.push([state.fixedRule.revision, state.selected?.wording]);
  }));
  await expect.poll(() => availability(running).kind).toBe('unavailable');
  expect(running.archive.getSnapshot().selected).toBeNull();
  expect(running.archive.getSnapshot().checks).toBeNull();
  expect(running.archive.getSnapshot().panel).toEqual({ kind: 'closed' });
  expect(published).toEqual([]);

  let release!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { release = resolve; });
  f.intercept(url => url.pathname.endsWith(`/rules/${rule}`) ? held : Promise.resolve(Response.json(f.fixedData(url))));
  const refreshing = recovery === 'manual' ? running.archive.refreshArchive() : poll();
  await expect.poll(() => f.requests.filter(request => request.url.pathname.endsWith(`/rules/${rule}`)).length).toBe(2);
  expect(availability(running)).toEqual({ kind: 'unavailable', revision: null, reason: 'Exact recorded wording is unavailable or conflicting.' });
  expect(running.archive.getSnapshot().selected).toBeNull();
  expect(published).toEqual([]);
  release(Response.json(f.fixedData(new URL(`/api/sessions/${session}/rules/${rule}`, location.href))));
  await refreshing;
  expect(availability(running)).toEqual({ kind: 'ready', revision, rule });
  expect(running.archive.getSnapshot().selected?.wording).toEqual({ state: 'available', text: 'Do not directly use write/edit tools. Delegate those actions.' });
  expect(running.archive.getSnapshot().checks?.items.map(check => ({ status: check.status, reason: check.reason }))).toEqual([{ status: 'clear', reason: 'recorded-pass' }]);
  expect(running.archive.getSnapshot().panel).toEqual({ kind: 'rule', rule });
  expect(published[0]).toEqual([revision, { state: 'available', text: 'Do not directly use write/edit tools. Delegate those actions.' }]);
  expect(published.every(value => JSON.stringify(value) === JSON.stringify(published[0]))).toBe(true);
  const selected = running.archive.getSnapshot().selected;
  await poll();
  expect(running.archive.getSnapshot().selected).toBe(selected);
  expect(f.requests.filter(request => request.url.pathname.endsWith(`/rules/${rule}`)).map(request => request.url.searchParams.get('revision'))).toEqual([revision, revision]);
});

for (const [reason, conflict] of [['recorded-declaration-conflict', false], ['source-unavailable-or-changed', true]] as const) test(`stable wording limitation ${reason} with conflict ${conflict} stays revision-cached`, async () => {
  const f = fixedRuleFixture();
  f.intercept(url => Promise.resolve(Response.json({ ...f.fixedData(url), ...(url.pathname.endsWith(`/rules/${rule}`) ? { rule: { ...f.item, wordingConflict: conflict }, wording: { state: 'unavailable', reason } } : {}) })));
  const running = start(f);
  await expect.poll(() => availability(running)).toEqual({ kind: 'unavailable', revision, reason: 'Exact recorded wording is unavailable or conflicting.' });
  await running.archive.refreshArchive();
  expect(availability(running)).toEqual({ kind: 'unavailable', revision, reason: 'Exact recorded wording is unavailable or conflicting.' });
  expect(running.archive.getSnapshot().selected).toBeNull();
  expect(f.requests.filter(request => request.url.pathname.endsWith(`/rules/${rule}`))).toHaveLength(1);
});

test('later rule pages resolve without expanding the general list and duplicate exact declarations remain unavailable', async () => {
  const f = fixedRuleFixture(), duplicate = '1'.repeat(64);
  f.intercept(url => {
    const value = f.fixedData(url) as any;
    if (url.pathname.endsWith('/rules')) return Promise.resolve(Response.json({ ...value, items: url.searchParams.has('cursor') ? [{ ...f.item, preview: fixedWording }] : Array.from({ length: 50 }, (_, i) => ({ ...f.item, id: String(i + 100).padStart(64, '0'), preview: 'Other wording.' })), next: url.searchParams.has('cursor') ? null : 'later', revision }));
    if (url.pathname.endsWith(`/rules/${rule}`) || url.pathname.endsWith(`/rules/${duplicate}`)) return Promise.resolve(Response.json({ ...value, revision, rule: { ...f.item, id: url.pathname.split('/').at(-1), preview: fixedWording }, wording: { state: 'available', text: fixedWording } }));
    return Promise.resolve(Response.json(value));
  });
  const running = start(f);
  await expect.poll(() => availability(running)).toEqual({ kind: 'ready', revision, rule });
  expect(running.archive.getSnapshot().rules?.items).toHaveLength(50);
  expect(running.archive.getSnapshot().selected?.wording).toEqual({ state: 'available', text: fixedWording });
  expect(f.requests.filter(r => r.url.searchParams.has('cursor')).map(r => r.url.searchParams.get('revision'))).toEqual([revision]);
  f.intercept(url => {
    const value = f.fixedData(url) as any;
    return Promise.resolve(Response.json({ ...value, revision: 'new', ...(value.sessions ? { sessions: value.sessions.map((row: any) => ({ ...row, revision: 'new' })) } : {}),
      ...(url.pathname.endsWith('/rules') ? { items: [{ ...f.item, preview: fixedWording }, { ...f.item, id: duplicate, preview: fixedWording }] } : {}),
      ...(url.pathname.includes('/rules/') && !url.pathname.endsWith('/checks') ? { rule: { ...f.item, id: url.pathname.split('/').at(-1) }, wording: { state: 'available', text: fixedWording } } : {}),
    }));
  });
  await running.archive.refreshArchive();
  expect(availability(running)).toEqual({ kind: 'unavailable', revision: 'new', reason: 'More than one recorded declaration has this exact wording. Choose the full Inspector to inspect them.' });
  expect(running.archive.getSnapshot().selected).toBeNull();
  const reads = f.requests.filter(request => request.url.pathname.includes('/rules/') && !request.url.pathname.endsWith('/checks')).length;
  await running.archive.refreshArchive();
  expect(availability(running)).toEqual({ kind: 'unavailable', revision: 'new', reason: 'More than one recorded declaration has this exact wording. Choose the full Inspector to inspect them.' });
  expect(f.requests.filter(request => request.url.pathname.includes('/rules/') && !request.url.pathname.endsWith('/checks'))).toHaveLength(reads);
});

for (const extra of [{ inventory: { state: 'unknown', reasons: ['source-missing'] } }, { ruleCoverage: { incomplete: true } }]) test('incomplete sources do not claim uniqueness', async () => {
  const f = fixedRuleFixture();
  f.intercept(url => {
    const value = f.fixedData(url) as any;
    return Promise.resolve(Response.json({ ...value, ...(url.pathname.endsWith('/rules') ? { ...extra, ruleCoverage: { ...value.ruleCoverage, ...extra.ruleCoverage } } : {}) }));
  });
  const running = start(f);
  await expect.poll(() => availability(running)).toEqual({ kind: 'unavailable', revision, reason: 'Recorded rule sources are incomplete. Exact rule identity cannot be established.' });
  f.intercept(url => Promise.resolve(Response.json(f.fixedData(url))));
  await running.archive.refreshArchive();
  expect(availability(running)).toEqual({ kind: 'unavailable', revision, reason: 'Recorded rule sources are incomplete. Exact rule identity cannot be established.' });
  expect(running.archive.getSnapshot().selected).toBeNull();
  expect(f.requests.filter(request => request.url.pathname.endsWith(`/rules/${rule}`))).toHaveLength(0);
});

test('unchanged revisions avoid wording rereads and relevant revisions re-resolve atomically', async () => {
  const f = start();
  await expect.poll(() => availability(f)).toEqual({ kind: 'ready', revision, rule });
  await f.archive.selectInvocation(invocation);
  const before = f.archive.getSnapshot(), reads = f.requests.filter(r => r.url.pathname.endsWith(`/rules/${rule}`)).length;
  await f.archive.refreshArchive();
  expect(f.archive.getSnapshot().selected).toBe(before.selected);
  expect(f.archive.getSnapshot().checks).toBe(before.checks);
  expect(f.archive.getSnapshot().openRecords).toBe(before.openRecords);
  expect(f.requests.filter(r => r.url.pathname.endsWith(`/rules/${rule}`))).toHaveLength(reads);
  f.intercept(url => {
    const value = f.fixedData(url) as any;
    return Promise.resolve(Response.json({ ...value, revision: 'new', ...(value.sessions ? { sessions: value.sessions.map((row: any) => ({ ...row, revision: 'new' })) } : {}),
      ...(url.pathname.endsWith(`/rules/${rule}`) ? { wording: { state: 'available', text: 'Changed wording.' } } : {}),
    }));
  });
  await f.archive.refreshArchive();
  expect(availability(f)).toEqual({ kind: 'unavailable', revision: 'new', reason: 'No declaration with this exact wording was found in the available recorded rules.' });
  expect(f.archive.getSnapshot().selected).toBeNull(); expect(f.archive.getSnapshot().openRecords).toEqual({});
});

for (const [name, endpoint, reason] of [
  ['checks', '/checks', 'Recorded rule unavailable. Archive request failed: 503. Try refreshing.'],
  ['exact wording', `/rules/${rule}`, 'Archive request failed: 503. Try refreshing.'],
] as const) test(`explicit refresh retries a transient ${name} error at the same revision`, async () => {
  const f = fixedRuleFixture();
  f.intercept(url => Promise.resolve(url.pathname.endsWith(endpoint) ? new Response('{}', { status: 503 }) : Response.json(f.fixedData(url))));
  const running = start(f);
  await expect.poll(() => availability(running).kind).toBe('unavailable');
  expect(availability(running)).toMatchObject({ kind: 'unavailable', reason });
  expect(running.archive.getSnapshot().selected).toBeNull();
  expect(running.archive.getSnapshot().checks).toBeNull();
  expect(running.archive.getSnapshot().panel).toEqual({ kind: 'closed' });

  f.intercept(url => Promise.resolve(Response.json(f.fixedData(url))));
  await running.archive.refreshArchive();
  expect(availability(running)).toEqual({ kind: 'ready', revision, rule });
  expect(running.archive.getSnapshot().selected?.wording).toEqual({ state: 'available', text: 'Do not directly use write/edit tools. Delegate those actions.' });
  expect(running.archive.getSnapshot().checks?.items.map(check => ({ status: check.status, reason: check.reason }))).toEqual([{ status: 'clear', reason: 'recorded-pass' }]);
  expect(running.archive.getSnapshot().panel).toEqual({ kind: 'rule', rule });
});
test('session changes abort fixed identity reads and reject stale success', async () => {
  const f = fixedRuleFixture(); let resolve!: (response: Response) => void;
  const held = new Promise<Response>(done => { resolve = done; });
  f.intercept(url => url.pathname.endsWith(`/rules/${rule}`) && url.pathname.includes(session) ? held : Promise.resolve(Response.json(f.fixedData(url))));
  const running = start(f);
  await expect.poll(() => f.requests.at(-1)?.url.pathname).toBe(`/api/sessions/${session}/rules/${rule}`);
  const request = f.requests.at(-1)!;
  await running.archive.selectSession(other);
  expect(availability(running)).toEqual({ kind: 'ready', revision, rule });
  expect(running.archive.getSnapshot().session).toBe(other); expect(request.signal.aborted).toBe(true);
  const current = running.archive.getSnapshot(); resolve(Response.json(f.fixedData(request.url)));
  await new Promise(done => setTimeout(done, 0));
  expect(running.archive.getSnapshot()).toBe(current);
});

test('a non-Pi recorded host is unavailable rather than assigned a role', async () => {
  const f = fixedRuleFixture();
  f.intercept(url => {
    const data = f.fixedData(url) as any;
    return Promise.resolve(Response.json({ ...data, ...(data.sessions ? { sessions: data.sessions.map((row: any) => ({ ...row, host: 'sdk' })) } : {}) }));
  });
  const running = start(f);
  await expect.poll(() => availability(running)).toEqual({ kind: 'unavailable', revision, reason: 'Recorded Pi session metadata is unavailable. Choose a recorded Pi session.' });
});

test('withdrawn fixed checks release hidden detail ownership with the unavailable presentation', async () => {
  const f = start();
  await expect.poll(() => availability(f)).toEqual({ kind: 'ready', revision, rule });
  await f.archive.selectInvocation(invocation);
  f.intercept(url => {
    const value = f.fixedData(url) as any;
    return Promise.resolve(url.pathname.endsWith('/checks') ? new Response('{}', { status: 404 }) : Response.json({ ...value, revision: 'new',
      ...(value.sessions ? { sessions: value.sessions.map((row: any) => ({ ...row, revision: 'new' })) } : {}),
    }));
  });
  await f.archive.refreshArchive();
  expect(availability(f)).toEqual({ kind: 'unavailable', revision: null, reason: 'Recorded rule unavailable. Recording not found. Refresh the archive or choose another session.' });
  expect(f.archive.getSnapshot().panel).toEqual({ kind: 'closed' });
  expect(f.archive.getSnapshot().openRecords).toEqual({});
});

test('an owner-supplied Pi session URL resolves recorded metadata beyond the first session page', async () => {
  const f = fixedRuleFixture();
  f.intercept(url => {
    const value = f.fixedData(url) as any;
    return Promise.resolve(Response.json(url.pathname === '/api/sessions' ? { ...value,
      sessions: url.searchParams.has('cursor') ? [f.rows[0]] : Array.from({ length: 50 }, (_, i) => ({ ...f.rows[1], id: String(i + 100).padStart(64, '0') })),
      next: url.searchParams.has('cursor') ? null : 'more-sessions',
    } : value));
  });
  const running = start(f);
  await expect.poll(() => availability(running)).toEqual({ kind: 'ready', revision, rule });
  expect(running.archive.getSnapshot().sessions.find(row => row.id === session)?.host).toBe('pi');
  expect(running.archive.getSnapshot().selected?.wording).toEqual({ state: 'available', text: fixedWording });
});

test('a fixed identity read recovers a 409 without publishing mixed revisions', async () => {
  const f = fixedRuleFixture(); let advanced = false;
  f.intercept(url => {
    if (url.pathname.endsWith(`/rules/${rule}`) && !advanced) { advanced = true; return Promise.resolve(new Response('{}', { status: 409 })); }
    const value = f.fixedData(url) as any;
    return Promise.resolve(Response.json({ ...value, ...(advanced ? { revision: 'new', ...(value.sessions ? { sessions: value.sessions.map((row: any) => ({ ...row, revision: 'new' })) } : {}) } : {}) }));
  });
  const running = start(f), published: unknown[] = [];
  cleanups.push(running.archive.subscribe(() => {
    const state = running.archive.getSnapshot();
    if (state.fixedRule.kind === 'ready') published.push([state.fixedRule.revision, state.selected?.revision, state.checks?.revision]);
  }));
  await expect.poll(() => availability(running)).toEqual({ kind: 'ready', revision: 'new', rule });
  expect(published.every(value => JSON.stringify(value) === '["new","new","new"]')).toBe(true);
  expect(published[0]).toEqual(['new', 'new', 'new']);
});
