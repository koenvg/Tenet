import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile, readdir, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard } from 'tenet';
import { OperationsReader, type OperationsView } from '../src/inspector/operations-reader.js';
import { createGuard as createSourceGuard } from '../src/sdk/index.js';
import { OPERATIONS_DIRECTORY, type OperationsSnapshot } from '../src/runtime/operations.js';
import { answer } from './helpers.js';

async function fixture() {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'ops-runtime-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
  return cwd;
}
async function until(reader: OperationsReader, predicate: (view: OperationsView) => boolean) {
  const deadline = Date.now() + 5000;
  while (true) {
    await reader.refresh(true); const view = await reader.read({ window: 15 });
    if (predicate(view)) return view;
    assert.ok(Date.now() < deadline, 'Operations checkpoint timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
for (const phase of ['judge', 'approval'] as const) test(`Operations tracks ${phase} ignoring abort without changing permission`, async () => {
  const cwd = await fixture(), root = join(cwd, 'recordings');
  let entered = false;
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  const guard = createGuard({ host: 'test', capabilities: ['interception', 'trusted-approval'],
    env: { TENET_MODE: 'enforce', TENET_RECORDING_DIR: root }, controlPath: join(cwd, 'control', 'state.json'),
    judge: async request => { if (phase === 'judge') { entered = true; await stalled; } return answer(request.policy, 'APPROVAL_REQUIRED'); } });
  const reader = new OperationsReader(root);
  try {
    const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const controller = new AbortController();
    const input = { callId: 'call', toolName: 'opaque', input: {} };
    const pending = session.beforeTool({ ...input, signal: controller.signal, current: () => ({ sessionId: 'one', contextId: 'main', ...input }),
      approve: async () => { entered = true; await stalled; return 'approved'; } });
    while (!entered) await new Promise(resolve => setTimeout(resolve, 1));
    const active = await until(reader, v => phase === 'judge' ? v.current?.analyzing === 1 : v.current?.approval === 1);
    assert.equal(active.requests[0]?.queueWaitMs, undefined);
    controller.abort();
    assert.equal((await pending).permission, 'blocked');
    const terminal = await until(reader, v => v.requests[0]?.permission.kind === 'committed');
    assert.equal(terminal.requests[0]?.permission.kind, 'committed');
    assert.equal(terminal.current?.approval, 0);
    assert.equal(terminal.current?.analyzing, 0);
    release();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal((await reader.read({ window: 15 })).requests[0]?.permission.kind, 'committed');
  } finally { release(); await guard.close(); await reader.close(); await rm(cwd, { recursive: true, force: true }); }
});
test('observe host cancellation after release does not cancel observation; invalidation does', async () => {
  const cwd = await fixture(), root = join(cwd, 'recordings');
  let entered = false, release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  const guard = createGuard({ host: 'test', capabilities: ['interception'], env: { TENET_RECORDING_DIR: root }, controlPath: join(cwd, 'control', 'state.json'),
    judge: async request => { entered = true; await stalled; return answer(request.policy, 'PASS'); } });
  const reader = new OperationsReader(root);
  try {
    const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const controller = new AbortController();
    const call = { callId: 'call', toolName: 'opaque', input: {} };
    const result = await session.beforeTool({ ...call, signal: controller.signal, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
    assert.equal(result.permission, 'released');
    while (!entered) await new Promise(resolve => setTimeout(resolve, 1));
    controller.abort();
    const active = await until(reader, v => v.current?.analyzing === 1);
    assert.deepEqual(active.requests[0]?.permission.kind, 'committed');
    session.invalidate('context-replaced');
    const terminal = await until(reader, v => v.requests[0]?.assessment.kind === 'settled');
    assert.equal(terminal.requests[0]?.assessment.kind === 'settled' && terminal.requests[0].assessment.outcome, 'cancelled');
    release();
  } finally { release(); await guard.close(); await reader.close(); await rm(cwd, { recursive: true, force: true }); }
});
for (const kind of ['off', 'external', 'dormant', 'inactive', 'invalid'] as const) test(`Operations has no filesystem side effects for ${kind}`, async () => {
  const cwd = await fixture(), root = join(cwd, 'recordings');
  if (kind === 'dormant') await rm(join(cwd, 'TENET.md'));
  const guard = createGuard({ host: 'test', capabilities: ['interception'], controlPath: join(cwd, 'control', 'state.json'),
    env: { TENET_RECORDING_DIR: root, ...(kind === 'off' ? { TENET_RECORDING: 'off' } : {}), ...(kind === 'invalid' ? { TENET_RECORDING: 'invalid' } : {}) },
    ...(kind === 'external' ? { bindRecording: () => () => {} } : {}), judge: async request => answer(request.policy, 'PASS') });
  try {
    if (kind === 'inactive') await guard.setActivation('off');
    const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const call = { callId: 'call', toolName: 'opaque', input: {} };
    await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
    await guard.close();
    const files: string[] = await readdir(root).catch(() => [] as string[]);
    assert.equal(files.includes('.operations-v1'), false);
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});

for (const scenario of ['capture', 'post-approval', 'unsafe-identity'] as const) test(`Operations settles ${scenario} without changing authorization`, async () => {
  const cwd = await fixture(), root = join(cwd, 'recordings');
  const diagnostics: string[] = [];
  const guard = createGuard({ host: 'test', capabilities: ['interception', 'trusted-approval'], controlPath: join(cwd, 'control', 'state.json'),
    onOwnerRecord: record => diagnostics.push(JSON.stringify(record)), onOwnerEvent: event => diagnostics.push(JSON.stringify(event)),
    env: { TENET_MODE: 'enforce', TENET_RECORDING_DIR: root, TYPESAFE_API_KEY: 'identity-sentinel' },
    actionResolver: scenario === 'unsafe-identity' ? undefined : { id: 'fixture', version: '1', semantics: ['opaque'],
      resolve: async ({ binding }) => { if (scenario === 'capture') throw new Error('private-resolver-error');
        return { version: 1, binding, integration: { id: 'fixture', version: '1' }, resolverState: 'one', coverage: 'complete',
          operations: [{ id: 'one', semantics: 'opaque', resources: [], content: [] }], limitations: [] }; }, revalidate: async () => null },
    judge: async request => answer(request.policy, 'APPROVAL_REQUIRED') });
  const reader = new OperationsReader(root);
  try {
    const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const call = { callId: 'call', toolName: scenario === 'unsafe-identity' ? 'identity-sentinel' : 'opaque', input: {} };
    const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }), approve: async () => 'approved' });
    assert.equal(result.permission, scenario === 'unsafe-identity' ? 'released' : 'blocked');
    const view = await until(reader, v => v.requests[0]?.permission.kind === 'committed');
    assert.equal(view.current?.analyzing, 0); assert.equal(view.current?.approval, 0);
    assert.equal(view.requests[0]?.assessment.kind, 'settled');
    if (scenario === 'capture') assert.equal(view.requests[0]?.assessment.kind === 'settled' && view.requests[0].assessment.outcome, 'unavailable');
    if (scenario === 'post-approval') assert.equal(view.requests[0]?.permission.kind === 'committed' && view.requests[0].permission.outcome, 'blocked');
    if (scenario === 'unsafe-identity') { assert.equal(JSON.stringify(view).includes('identity-sentinel'), false); assert.equal(diagnostics.join('').includes('identity-sentinel'), false); assert.ok(view.loss.withheld > 0); assert.equal(view.requests[0]?.archive, undefined); }
  } finally { await guard.close(); await reader.close(); await rm(cwd, { recursive: true, force: true }); }
});

async function publication(root: string, after = -1) {
  const folder = join(root, OPERATIONS_DIRECTORY), deadline = Date.now() + 5000;
  while (true) {
    const files = (await readdir(folder).catch(() => [] as string[])).filter(f => f.endsWith('.json'));
    assert.ok(files.length <= 1);
    if (files[0]) {
      const raw = await readFile(join(folder, files[0]), 'utf8');
      const doc: OperationsSnapshot = JSON.parse(raw);
      if (doc.sequence > after) return { raw, doc };
    }
    assert.ok(Date.now() < deadline, 'Operations publication timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

for (const [sdk, create] of [['source', createSourceGuard], ['compiled', createGuard]] as const) {
  test(`${sdk} SDK keeps session 257 analyzing after 256 idle siblings close until owner disposal`, async () => {
    const cwd = await fixture(), root = join(cwd, 'recordings');
    let entered = false, release!: () => void;
    const stalled = new Promise<void>(resolve => { release = resolve; });
    const guard = create({ host: 'fixture', env: { TENET_RECORDING_DIR: root, TENET_JUDGE_DEADLINE_MS: '20000' }, controlPath: join(cwd, 'control.json'),
      judge: async request => { entered = true; await stalled; return answer(request.policy, 'PASS'); } });
    const reader = new OperationsReader(root);
    try {
      const sessions = [];
      for (let i = 0; i < 257; i++) {
        const session = guard.openSession({ sessionId: `session-${i}`, contextId: 'main' }, cwd);
        await session.ready; sessions.push(session);
      }
      const call = { callId: 'call', toolName: 'fixture', input: {} };
      assert.equal((await sessions[256]!.beforeTool({ ...call,
        current: () => ({ ...call, sessionId: 'session-256', contextId: 'main' }) })).permission, 'released');
      while (!entered) await new Promise(resolve => setTimeout(resolve, 1));
      await until(reader, view => view.current?.analyzing === 1);
      const before = await publication(root);
      for (const session of sessions.slice(0, 256)) await session.close();
      assert.equal(guard.status().sessions, 1);
      const { doc } = await publication(root, before.doc.sequence);
      assert.equal(doc.state, 'running');
      assert.equal(doc.projects.length, 1);
      assert.equal(doc.requests.length, 1);
      assert.equal(doc.requests[0]?.assessment.kind, 'analyzing');
      assert.equal(doc.requests[0]?.permission.kind, 'committed');
      assert.equal(doc.requests[0]?.permission.kind === 'committed' && doc.requests[0].permission.outcome, 'released');
      assert.equal(doc.loss.activeOmitted, false);
      await reader.refresh(true);
      const active = await reader.read({ window: 15 });
      assert.equal(active.coverage, 'observed');
      assert.deepEqual(active.runtimes.map(r => r.freshness), ['fresh']);
      assert.deepEqual(active.current, { queued: 0, analyzing: 1, approval: 0, other: 0 });
      const heartbeat = await publication(root, doc.sequence);
      assert.equal(heartbeat.doc.state, 'running');
      assert.equal(heartbeat.doc.requests[0]?.assessment.kind, 'analyzing');
      await guard.close();
      assert.equal(guard.status().sessions, 0);
      const closed = await publication(root, heartbeat.doc.sequence);
      assert.equal(closed.doc.state, 'closed');
      assert.equal(closed.doc.requests[0]?.assessment.kind === 'settled' && closed.doc.requests[0].assessment.outcome, 'interrupted');
      assert.equal(closed.doc.requests[0]?.permission.kind === 'committed' && closed.doc.requests[0].permission.outcome, 'released');
      await reader.refresh(true);
      const final = await reader.read({ window: 15 });
      assert.deepEqual(final.runtimes.map(r => r.freshness), ['closed']);
      assert.equal(final.current, null);
      assert.equal(final.coverage, 'unknown');
    } finally { release(); await guard.close(); await reader.close(); await rm(cwd, { recursive: true, force: true }); }
  });

  test(`${sdk} SDK accounts for initially withheld idle project metadata exactly once`, async () => {
    const parent = await fixture(), sentinel = 'fixture-project-credential-sentinel';
    const cwd = join(parent, sentinel), root = join(parent, 'recordings');
    await mkdir(cwd); await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep fixture data local.');
    let judgeCalls = 0;
    const guard = create({ host: 'fixture', env: { TENET_RECORDING_DIR: root, TYPESAFE_API_KEY: sentinel },
      controlPath: join(parent, 'control.json'), judge: async request => { judgeCalls++; return answer(request.policy, 'PASS'); } });
    const reader = new OperationsReader(root);
    try {
      const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
      let previous = -1;
      for (let i = 0; i < 3; i++) {
        if (i > 0) {
          const sibling = guard.openSession({ sessionId: `sibling-${i}`, contextId: 'main' }, cwd); await sibling.ready;
        }
        const { raw, doc } = await publication(root, previous); previous = doc.sequence;
        assert.equal(doc.state, 'running');
        assert.deepEqual(doc.projects.map(p => p.label), ['Project withheld']);
        assert.equal(doc.requests.length, 0);
        assert.equal(doc.loss.withheld, 1);
        assert.equal(doc.loss.activeOmitted, false);
        assert.equal(raw.includes(sentinel), false);
        assert.equal(raw.includes(cwd), false);
        await reader.refresh(true);
        const view = await reader.read({ window: 15 });
        assert.equal(view.coverage, 'partial');
        assert.equal(view.loss.withheld, 1);
        assert.deepEqual(view.current, { queued: 0, analyzing: 0, approval: 0, other: 0 });
        assert.equal(JSON.stringify(view).includes(sentinel), false);
        assert.equal(judgeCalls, 0);
      }
    } finally { await guard.close(); await reader.close(); await rm(parent, { recursive: true, force: true }); }
  });

  test(`${sdk} SDK owner remains idle between sessions and seals off, reactivates and shuts down honestly`, async () => {
    const cwd = await fixture(), root = join(cwd, 'recordings'), dormant = join(cwd, 'dormant');
    await mkdir(dormant);
    let release!: () => void;
    const stalled = new Promise<void>(resolve => { release = resolve; });
    const guard = create({ host: 'fixture', env: { TENET_RECORDING_DIR: root, TENET_JUDGE_DEADLINE_MS: '20000' },
      controlPath: join(cwd, 'control.json'), judge: async request => { await stalled; return answer(request.policy, 'PASS'); } });
    const reader = new OperationsReader(root);
    try {
      const quiet = guard.openSession({ sessionId: 'dormant', contextId: 'main' }, dormant); await quiet.ready;
      assert.deepEqual(await readdir(root).catch(() => [] as string[]), []);
      await guard.setActivation('off');
      const session = guard.openSession({ sessionId: 'active', contextId: 'main' }, cwd); await session.ready;
      assert.deepEqual(await readdir(root).catch(() => [] as string[]), []);
      await guard.setActivation('on');
      const idle = await until(reader, view => view.current?.analyzing === 0);
      assert.equal(idle.coverage, 'observed');
      assert.equal(idle.projects.length, 1);
      const call = { callId: 'first', toolName: 'fixture', input: {} };
      const invoke = (callId: string) => session.beforeTool({ ...call, callId,
        current: () => ({ ...call, callId, sessionId: 'active', contextId: 'main' }) });
      assert.equal((await invoke('first')).permission, 'released');
      await until(reader, view => view.current?.analyzing === 1);
      await guard.setActivation('off');
      const suspended = await until(reader, view => view.runtimes[0]?.freshness === 'suspended');
      assert.equal(suspended.current, null);
      const sealed = await publication(root);
      assert.equal(sealed.doc.state, 'suspended');
      assert.deepEqual(sealed.doc.projects, []);
      assert.deepEqual(sealed.doc.requests, []);
      await guard.setActivation('on');
      const reactivated = await until(reader, view => view.runtimes[0]?.freshness === 'fresh');
      assert.equal(reactivated.coverage, 'observed');
      assert.deepEqual(reactivated.current, { queued: 0, analyzing: 0, approval: 0, other: 0 });
      assert.equal(reactivated.requests.length, 0);
      assert.equal(reactivated.projects.length, 1);
      assert.equal((await invoke('second')).permission, 'released');
      await until(reader, view => view.current?.analyzing === 1);
      await session.close(); await quiet.close();
      assert.equal(guard.status().sessions, 0);
      const ended = await until(reader, view => view.requests[0]?.assessment.kind === 'settled');
      assert.deepEqual(ended.runtimes.map(r => r.freshness), ['fresh']);
      assert.equal(ended.coverage, 'observed');
      assert.deepEqual(ended.current, { queued: 0, analyzing: 0, approval: 0, other: 0 });
      assert.equal(ended.requests[0]?.assessment.kind === 'settled' && ended.requests[0].assessment.outcome, 'interrupted');
      const reopened = guard.openSession({ sessionId: 'reopened', contextId: 'main' }, cwd); await reopened.ready;
      await guard.setActivation('off');
      await until(reader, view => view.runtimes[0]?.freshness === 'suspended');
      await guard.close();
      const final = await until(reader, view => view.runtimes[0]?.freshness === 'closed');
      assert.equal(final.current, null);
      assert.equal(final.coverage, 'unknown');
      const closed = await publication(root);
      assert.equal(closed.doc.state, 'closed');
      assert.deepEqual(closed.doc.projects, []);
      assert.deepEqual(closed.doc.requests, []);
    } finally { release(); await guard.close(); await reader.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}
