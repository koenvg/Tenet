import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationsRuntime, OPERATIONS_DIRECTORY } from '../src/runtime/operations.js';
import { OperationsReader } from '../src/inspector/operations-reader.js';
import { diagnosticSafety } from '../src/runtime/diagnostic-safety.js';

const identity = { host: 'fixture', sessionId: 'one', contextId: 'main', invocationId: '00000000-0000-4000-8000-000000000001', callId: 'call', toolName: 'fixture', cwd: '/fixture', mode: 'enforce' as const };
for (const state of ['closed', 'suspended', 'invalid', 'stale', 'live'] as const) test(`reader admits a new live owner after 16 ${state} cached occupants within five refreshes`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'ops-admission-')), folder = join(root, OPERATIONS_DIRECTORY);
  await mkdir(folder, { mode: 0o700 });
  let now = 100000;
  const reader = new OperationsReader(root, () => now);
  const publish = async (state: 'closed' | 'suspended' | 'live') => {
    const owner = new OperationsRuntime({ enabled: false, directory: root }, () => diagnosticSafety([]), undefined, () => now);
    owner.begin(identity).analyzing();
    if (state === 'closed') await owner.close(100);
    if (state === 'suspended') owner.suspend();
    const doc = owner.snapshot();
    await writeFile(join(folder, `${doc.runtimeId}.json`), JSON.stringify(doc), { mode: 0o600 });
    return doc.runtimeId;
  };
  try {
    const ids = [];
    for (let i = 0; i < 16; i++) ids.push(await publish(state === 'closed' || state === 'suspended' ? state : 'live'));
    const first = await reader.read({ window: 15 });
    assert.equal(first.runtimes.length, 16);
    assert.equal(first.current?.analyzing ?? null, state === 'closed' || state === 'suspended' ? null : 16);
    if (state === 'invalid') {
      for (const id of ids) await writeFile(join(folder, `${id}.json`), '{}', { mode: 0o600 });
      await reader.refresh(true);
      assert.equal((await reader.read({ window: 15 })).current, null);
    }
    if (state === 'stale') now += 10001;
    const fresh = await publish('live');
    for (let i = 0; i < 5; i++) await reader.refresh(true);
    const view = await reader.read({ window: 15 });
    assert.equal(view.runtimes.some(r => r.id === fresh && r.freshness === 'fresh'), true);
    assert.equal(view.current?.analyzing, state === 'live' ? 16 : 1);
    assert.equal(view.runtimes.length <= 16, true);
    assert.equal(view.coverage, 'partial');
    assert.equal(view.issues.includes('history-omitted'), true);
    if (state === 'live') assert.equal(view.issues.includes('reader-budget'), true);
  } finally { await reader.close(); await rm(root, { recursive: true, force: true }); }
});

test('reader favors fresh active owners over new closed history under discovery pressure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ops-admission-')), folder = join(root, OPERATIONS_DIRECTORY);
  await mkdir(folder, { mode: 0o700 });
  let now = 100000;
  const reader = new OperationsReader(root, () => now);
  const files: { path: string; doc: ReturnType<OperationsRuntime['snapshot']> }[] = [];
  try {
    for (let i = 0; i < 80; i++) {
      const owner = new OperationsRuntime({ enabled: false, directory: root }, () => diagnosticSafety([]), undefined, () => now);
      owner.begin(identity).analyzing();
      if (i >= 16) await owner.close(100);
      const doc = owner.snapshot(), path = join(folder, `${doc.runtimeId}.json`);
      if (i < 16) files.push({ path, doc });
      await writeFile(path, JSON.stringify(doc), { mode: 0o600 });
      if (i === 15) assert.equal((await reader.read({ window: 15 })).current?.analyzing, 16);
    }
    for (let i = 0; i < 24; i++) {
      now += 2000;
      for (const { path, doc } of files) { doc.sequence++; doc.publishedAt = now; await writeFile(path, JSON.stringify(doc), { mode: 0o600 }); }
      await reader.refresh(true);
      const view = await reader.read({ window: 15 });
      assert.deepEqual(view.current, { queued: 0, analyzing: 16, approval: 0, other: 0 });
      assert.equal(view.runtimes.length, 16);
      assert.equal(view.coverage, 'partial');
      assert.equal(view.issues.includes('reader-budget'), true);
    }
  } finally { await reader.close(); await rm(root, { recursive: true, force: true }); }
});
