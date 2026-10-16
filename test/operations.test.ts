import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, mkdir, writeFile, symlink, link, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationsRuntime, readOperationsFile, parseOperationsSnapshot, OPERATIONS_DIRECTORY } from '../src/runtime/operations.js';
import { OperationsReader, aggregateOperations } from '../src/inspector/operations-reader.js';
import { diagnosticSafety } from '../src/runtime/diagnostic-safety.js';

const identity = { host: 'sdk', sessionId: 'session', contextId: 'context', invocationId: '00000000-0000-4000-8000-000000000001', callId: 'call', toolName: 'read', cwd: '/project', mode: 'observe' as const };
const setup = (now = 100000) => {
  let clock = now;
  const owner = new OperationsRuntime({ enabled: false, directory: '/unused' }, () => diagnosticSafety([]), undefined, () => clock);
  return { owner, tick: (ms: number) => { clock += ms; } };
};

describe('Operations facts', () => {
  test('assessment and committed permission stay independent; late results cannot resurrect cancellation', () => {
    const { owner, tick } = setup();
    const activity = owner.begin(identity);
    activity.permission('released'); activity.queued(); tick(20); activity.reserved(20);
    assert.equal(owner.snapshot().requests[0]?.assessment.kind, 'preparing');
    activity.analyzing(); tick(30); activity.settle('cancelled'); activity.settle('completed', 30);
    assert.equal(owner.snapshot().requests[0]?.assessment.kind, 'settled');
    assert.equal(owner.snapshot().requests[0]?.assessment.kind === 'settled' && (owner.snapshot().requests[0]!.assessment as { outcome: string }).outcome, 'cancelled');
    assert.deepEqual(owner.snapshot().requests[0]?.permission.kind, 'committed');
    assert.equal(owner.snapshot().requests[0]?.queueWaitMs, 20);
  });
  test('approval attempts are idempotent, finalizing is not permission, shutdown is interrupted', () => {
    const { owner } = setup(); const a = owner.begin({ ...identity, mode: 'enforce' });
    a.analyzing(); a.settle('completed', 100); a.approval('attempt', true); a.approval('attempt', true);
    assert.deepEqual(owner.snapshot().requests[0]?.permission, { kind: 'awaiting-approval', attempt: 'attempt', since: 100000 });
    a.approval('attempt', false);
    assert.equal(owner.snapshot().requests[0]?.permission.kind, 'finalizing');
    a.permission('blocked'); a.permission('released');
    assert.deepEqual(owner.snapshot().requests[0]?.permission, { kind: 'committed', outcome: 'blocked', at: 100000 });
    const b = owner.begin({ ...identity, invocationId: '00000000-0000-4000-8000-000000000002' });
    b.interrupt(); b.analyzing();
    assert.deepEqual(owner.snapshot().requests[1]?.assessment, { kind: 'settled', outcome: 'interrupted', at: 100000 });
  });
  test('aggregates use every retained sample rather than the page; queue samples exclude enforce', () => {
    const { owner, tick } = setup();
    for (let i = 1; i <= 120; i++) {
      const a = owner.begin({ ...identity, invocationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, mode: 'enforce' });
      a.analyzing(); tick(1); a.settle(i === 120 ? 'unavailable' : 'completed', i); a.permission('released');
    }
    const doc = owner.snapshot();
    const view = aggregateOperations([{ snapshot: doc, freshness: 'fresh' }], { window: 15, limit: 10 }, 100120);
    assert.equal(view.requests.length, 10);
    assert.deepEqual(view.analysis, { count: 120, mean: 60.5, p95: 114 });
    assert.equal(view.queue.count, 0);
    assert.equal(view.outcomes.completed, 119);
    assert.equal(view.outcomes.unavailable, 1);
    assert.deepEqual(view.current, { queued: 0, analyzing: 0, approval: 0, other: 0 });
    assert.equal(aggregateOperations([{ snapshot: doc, freshness: 'stale' }], { window: 15 }, 100120).current, null);
  });
  test('raw snapshot capture contains only detached loss counters, including suspension', async () => {
    const health = { enabled: true, directory: '/fixture/capture-credential-sentinel', failed: 2, dropped: 3, drainTimeouts: 4, written: 5, pending: 6 };
    const owner = new OperationsRuntime({ enabled: false, directory: '/unused' }, () => diagnosticSafety(['capture-credential-sentinel']), () => health);
    try {
      owner.begin(identity).analyzing();
      for (const state of ['running', 'suspended']) {
        if (state === 'suspended') owner.suspend();
        const snapshot = owner.snapshot();
        assert.equal(snapshot.state, state);
        assert.deepEqual(Object.keys(snapshot.capture).sort(), ['drainTimeouts', 'dropped', 'failed']);
        assert.deepEqual(snapshot.capture, { failed: 2, dropped: 3, drainTimeouts: 4 });
        assert.equal(JSON.stringify(snapshot).includes('capture-credential-sentinel'), false);
        snapshot.capture.failed = 99;
        assert.equal(health.failed, 2);
      }
    } finally { await owner.close(100); }
  });
  test('unsafe identities are withheld and projection is checked again before publication', () => {
    let secrets: string[] = [];
    const owner = new OperationsRuntime({ enabled: false, directory: '/unused' }, () => diagnosticSafety(secrets));
    owner.begin({ ...identity, toolName: 'SECRET' }); secrets = ['SECRET'];
    const text = JSON.stringify(owner.snapshot());
    assert.equal(text.includes('SECRET'), false);
    assert.ok(owner.snapshot().loss.withheld > 0);
  });
  test('first project projection counts withheld metadata once within the bounded registry', async () => {
    const sentinel = 'fixture-project-secret';
    const owner = new OperationsRuntime({ enabled: false, directory: '/unused' }, () => diagnosticSafety([sentinel]));
    try {
      for (let i = 0; i < 3; i++) {
        owner.registerProject(`/fixture/${sentinel}`);
        const doc = owner.snapshot();
        assert.deepEqual(doc.projects.map(p => p.label), ['Project withheld']);
        assert.equal(doc.loss.withheld, 1);
        assert.equal(doc.requests.length, 0);
        assert.equal(JSON.stringify(doc).includes(sentinel), false);
        const view = aggregateOperations([{ snapshot: doc, freshness: 'fresh' }], { window: 15 }, doc.publishedAt);
        assert.equal(view.loss.withheld, 1);
        assert.equal(view.coverage, 'partial');
      }
      for (let i = 1; i <= 64; i++) owner.registerProject(`/fixture/${i}/${sentinel}`);
      assert.equal(owner.snapshot().projects.length, 64);
      assert.equal(owner.snapshot().loss.withheld, 64);
      assert.equal(owner.snapshot().loss.activeOmitted, true);
    } finally { await owner.close(100); }
  });
  test('active overflow is partial, retention and encoded bounds are enforced', () => {
    const { owner, tick } = setup();
    for (let i = 0; i < 300; i++) owner.begin({ ...identity, invocationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` });
    assert.equal(owner.snapshot().requests.length, 256);
    assert.equal(owner.snapshot().loss.activeOmitted, true);
    assert.ok(Buffer.byteLength(JSON.stringify(owner.snapshot())) <= 1024 * 1024);
    tick(3600001);
    assert.equal(parseOperationsSnapshot(owner.snapshot()).runtimeId, owner.snapshot().runtimeId);
    assert.throws(() => parseOperationsSnapshot({ ...owner.snapshot(), version: 9 }), /unsupported/);
  });
});

describe('private bounded transport', () => {
  test('disabled and initially idle owners create nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ops-'));
    try {
      const off = new OperationsRuntime({ enabled: false, directory: root }, () => diagnosticSafety([]));
      off.begin(identity); await off.close(100); assert.deepEqual(await readdir(root), []);
      const idle = new OperationsRuntime({ enabled: true, directory: root }, () => diagnosticSafety([]));
      await idle.close(100); assert.deepEqual(await readdir(root), []);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test('atomic writer, reader freshness, invalid replacement, crash snapshot and suspended marker', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ops-'));
    const owner = new OperationsRuntime({ enabled: true, directory: root }, () => diagnosticSafety([]));
    const reader = new OperationsReader(root);
    try {
      owner.begin(identity).analyzing(); await owner.flush();
      let view = await reader.read({ window: 15 });
      assert.equal(view.current?.analyzing, 1);
      const file = join(root, OPERATIONS_DIRECTORY, `${owner.snapshot().runtimeId}.json`);
      await writeFile(file, '{}', { mode: 0o600 }); await reader.refresh(true);
      view = await reader.read({ window: 15 }); assert.equal(view.current, null); assert.ok(view.issues.includes('invalid'));
      owner.suspend(); await owner.flush();
      assert.equal((await readOperationsFile(root, file)).state, 'suspended');
      assert.deepEqual((await readOperationsFile(root, file)).requests, []);
    } finally { await owner.close(1000); await reader.close(); await rm(root, { recursive: true, force: true }); }
  });
  test('rejects symlinks, hardlinks, FIFOs, unsafe modes, strict UTF-8 and unsupported versions without hanging', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ops-')); const folder = join(root, OPERATIONS_DIRECTORY);
    await mkdir(folder, { mode: 0o700 }); const file = join(folder, 'record.json');
    const { owner } = setup();
    try {
      await writeFile(file, JSON.stringify(owner.snapshot()), { mode: 0o600 });
      await symlink(file, join(folder, 'symbol.json'));
      await assert.rejects(readOperationsFile(root, join(folder, 'symbol.json')));
      await link(file, join(folder, 'hard.json')); await assert.rejects(readOperationsFile(root, file));
      await rm(join(folder, 'hard.json'));
      await chmod(file, 0o644); await assert.rejects(readOperationsFile(root, file)); await chmod(file, 0o600);
      await writeFile(file, Buffer.from([0xff])); await assert.rejects(readOperationsFile(root, file));
      execFileSync('mkfifo', ['-m', '600', join(folder, 'pipe.json')]);
      await assert.rejects(readOperationsFile(root, join(folder, 'pipe.json')));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

test('reader capacity is partial, cached crash activity expires, and regressing publications become invalid', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ops-reader-')), folder = join(root, OPERATIONS_DIRECTORY);
  await mkdir(folder, { mode: 0o700 }); let now = 100000;
  const reader = new OperationsReader(root, () => now);
  try {
    const docs = [];
    for (let i = 0; i < 17; i++) {
      const { owner } = setup(now); owner.begin(identity).analyzing(); const doc = owner.snapshot(); docs.push(doc);
      await writeFile(join(folder, `${doc.runtimeId}.json`), JSON.stringify(doc), { mode: 0o600 });
    }
    const first = await reader.read({ window: 15 });
    assert.equal(first.current?.analyzing, 16); assert.equal(first.coverage, 'partial'); assert.ok(first.issues.includes('runtime-capacity'));
    now += 10001;
    const expired = await reader.read({ window: 15 }); assert.equal(expired.current, null);
    assert.equal(expired.runtimes.every(r => r.freshness === 'stale'), true);
    const doc = docs.find(d => d.runtimeId === first.runtimes[0]!.id)!; await writeFile(join(folder, `${doc.runtimeId}.json`), JSON.stringify({ ...doc, sequence: 5, publishedAt: now }), { mode: 0o600 });
    await reader.refresh(true);
    await writeFile(join(folder, `${doc.runtimeId}.json`), JSON.stringify({ ...doc, sequence: 4, publishedAt: now }), { mode: 0o600 });
    await reader.refresh(true); assert.ok((await reader.read({ window: 15 })).issues.includes('invalid'));
  } finally { await reader.close(); await rm(root, { recursive: true, force: true }); }
});

test('retained samples expire and project, timing window, outcome and pagination filters remain independent', () => {
  const { owner, tick } = setup(1000000);
  const first = owner.begin(identity); first.queued(); tick(10); first.reserved(10); first.analyzing(); first.settle('completed', 40); first.permission('released');
  tick(16 * 60000);
  const next = owner.begin({ ...identity, invocationId: '00000000-0000-4000-8000-000000000002', cwd: '/second', mode: 'enforce' });
  next.analyzing(); next.settle('unavailable', 80); next.permission('blocked');
  const doc = owner.snapshot(); doc.timing = 'measured';
  const recent = aggregateOperations([{ snapshot: doc, freshness: 'fresh' }], { window: 15 }, doc.publishedAt);
  assert.deepEqual(recent.analysis, { count: 1, mean: 80, p95: 80 }); assert.equal(recent.queue.count, 0);
  const hour = aggregateOperations([{ snapshot: doc, freshness: 'fresh' }], { window: 60, project: doc.requests[0]!.project, limit: 1 }, doc.publishedAt);
  assert.deepEqual(hour.analysis, { count: 1, mean: 40, p95: 40 }); assert.equal(hour.queue.mean, 10); assert.equal(hour.projects.length, 2);
  tick(3600001); assert.equal(owner.snapshot().requests.length, 0); assert.equal(owner.snapshot().loss.evicted, 2);
});


test('outcome filters use assessment completion within the window even while permission is pending', () => {
  const { owner, tick } = setup(1000000);
  const first = owner.begin({ ...identity, mode: 'enforce' });
  first.analyzing(); first.settle('completed', 40); first.approval('first', true);
  tick(16 * 60000);
  const secondId = '00000000-0000-4000-8000-000000000002';
  const second = owner.begin({ ...identity, invocationId: secondId, mode: 'enforce' });
  second.analyzing(); second.settle('completed', 80);
  const doc = owner.snapshot();
  const documents = [{ snapshot: doc, freshness: 'fresh' as const }];
  const recent = aggregateOperations(documents, { window: 15, state: 'completed' }, doc.publishedAt);
  assert.deepEqual(recent.requests.map(r => [r.id, r.state]), [[secondId, 'finalizing']]);
  assert.equal(recent.outcomes.completed, 1);
  assert.deepEqual(recent.current, { queued: 0, analyzing: 0, approval: 1, other: 1 });
  const hour = aggregateOperations(documents, { window: 60, state: 'completed' }, doc.publishedAt);
  assert.deepEqual(hour.requests.map(r => [r.id, r.state]), [[secondId, 'finalizing'], [identity.invocationId, 'approval']]);
  assert.equal(hour.outcomes.completed, 2);
  const approval = aggregateOperations(documents, { window: 15, state: 'approval' }, doc.publishedAt);
  assert.deepEqual(approval.requests.map(r => r.id), [identity.invocationId]);
});
