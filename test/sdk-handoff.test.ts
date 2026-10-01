import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createGuard, type GuardSession, type OwnerEvent } from 'tenet';
import { answer } from './helpers.js';
import { ArchiveWriter, readArchive } from '../src/recording/archive.js';

const host = { host: 'handoff', hostVersion: '1', hostProfile: 'scripted',
  capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation'] as const };
for (const interleaving of ['owner-callback', 'runtime-microtask'] as const) {
  for (const revocation of ['session-close', 'guard-close', 'invalidate', 'cancel', 'arguments', 'identity', 'policy'] as const) {
    test(`compiled enforce handoff rejects ${revocation} from ${interleaving}`, async () => {
      const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-handoff-')));
      const policyPath = join(cwd, 'TENET.md');
      await writeFile(policyPath, 'Rule; BLOCK; Keep private content local.');
      const controller = new AbortController();
      const events: OwnerEvent[] = [];
      const stages: { stage: string; data: Record<string, unknown> }[] = [];
      const archive = new ArchiveWriter({ enabled: true, directory: join(cwd, 'records') });
      let session!: GuardSession;
      let now = { sessionId: 'one', contextId: 'main', callId: 'call', toolName: 'opaque', input: { value: 'original' } };
      const revoke = () => {
        if (revocation === 'session-close') void session.close();
        if (revocation === 'guard-close') void guard.close();
        if (revocation === 'invalidate') session.invalidate('context-replaced');
        if (revocation === 'cancel') controller.abort();
        if (revocation === 'arguments') now = { ...now, input: { value: 'changed' } };
        if (revocation === 'identity') now = { ...now, contextId: 'replacement' };
        if (revocation === 'policy') writeFileSync(policyPath, 'Rule; BLOCK; Changed policy.');
      };
      let revoked = false;
      const guard = createGuard({ ...host, judge: async r => answer(r.policy),
        env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control', 'state.json'),
        bindRecording: identity => {
          const sink = archive.bind(identity);
          return (stage, data) => { stages.push({ stage, data }); sink(stage, data); };
        },
        onOwnerEvent: event => {
          events.push(event);
          if (interleaving === 'owner-callback' && event.type === 'permission' && event.result.permission === 'released' && !revoked) {
            revoked = true; revoke();
          }
        } });
      try {
        session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
        let reads = 0;
        const result = await session.beforeTool({ callId: now.callId, toolName: now.toolName, input: now.input, signal: controller.signal,
          current: () => {
            if (interleaving === 'runtime-microtask' && ++reads === 3) queueMicrotask(() => { revoked = true; revoke(); });
            return now;
          } });
        let executions = 0;
        if (result.permission === 'released') executions++;
        assert.equal(revoked, true);
        assert.equal(result.permission, 'blocked'); assert.equal(executions, 0);
        assert.equal(result.assessment.wouldDecision, 'ALLOW');
        assert.deepEqual(stages.filter(e => e.stage === 'permission').map(e => e.data.outcome), ['blocked']);
        assert.deepEqual(stages.filter(e => e.stage === 'execution'), [], 'no tracking before final permission');
        assert.equal(await archive.close(), true);
        const recorded = await readArchive(archive.config.directory);
        assert.deepEqual(recorded.issues, []);
        assert.deepEqual(recorded.records.filter(e => e.stage === 'permission').map(e => e.data.outcome), ['blocked']);
        assert.equal(session.afterTool({ callId: 'call', toolName: 'opaque' }).outcome, 'unknown');
        if (revocation === 'invalidate' || revocation === 'cancel' || revocation === 'arguments' || revocation === 'identity')
          assert.ok(!events.some(e => e.type === 'execution' && e.outcome === 'executed'));
      } finally { await guard.close(); await archive.close(); await rm(cwd, { recursive: true, force: true }); }
    });
  }
}

for (const choice of ['PASS', 'APPROVAL_REQUIRED'] as const) {
  test(`compiled ${choice} release commits once after owner delivery, then tracks execution`, async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-commit-')));
    await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
    const stages: { stage: string; data: Record<string, unknown> }[] = [];
    let session!: GuardSession;
    const preparations: { permission: string; recorded: boolean; execution: string }[] = [];
    const guard = createGuard({ ...host, capabilities: [...host.capabilities, 'trusted-approval'],
      judge: async r => answer(r.policy, choice), env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
      controlPath: join(cwd, 'control', 'state.json'),
      bindRecording: () => (stage, data) => { stages.push({ stage, data }); },
      onOwnerEvent: event => {
        if (event.type !== 'permission') return;
        preparations.push({ permission: event.result.permission, recorded: stages.some(e => e.stage === 'permission'),
          execution: session.afterTool({ callId: 'call', toolName: 'opaque' }).outcome });
      } });
    try {
      session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
      const call = { callId: 'call', toolName: 'opaque', input: {} };
      const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }),
        approve: async () => 'approved' });
      assert.deepEqual(preparations, [{ permission: 'released', recorded: false, execution: 'unknown' }]);
      assert.equal(result.permission, 'released');
      assert.deepEqual(stages.filter(e => e.stage === 'permission').map(e => e.data.outcome), ['released']);
      assert.equal(stages.some(e => e.stage === 'execution'), false);
      assert.equal(session.afterTool({ callId: 'call', toolName: 'opaque' }).outcome, 'executed');
      await session.close();
      assert.deepEqual(stages.filter(e => e.stage === 'permission').map(e => e.data.outcome), ['released']);
      assert.deepEqual(stages.filter(e => e.stage === 'execution').map(e => e.data.outcome), ['executed']);
    } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}
for (const closure of ['session', 'guard'] as const) {
  test(`compiled ${closure} close drains a blocked permission to the SDK-owned archive`, async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-close-archive-')));
    const directory = join(cwd, 'records');
    await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
    let session!: GuardSession;
    const guard = createGuard({ ...host, judge: async r => answer(r.policy),
      env: { TENET_MODE: 'enforce', TENET_RECORDING_DIR: directory }, controlPath: join(cwd, 'control', 'state.json'),
      onOwnerEvent: event => {
        if (event.type === 'permission' && event.result.permission === 'released') {
          if (closure === 'guard') void guard.close(); else void session.close();
        }
      } });
    try {
      session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
      const call = { callId: 'call', toolName: 'opaque', input: {} };
      const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
      assert.equal(result.permission, 'blocked');
      assert.equal(await guard.close(), true);
      const recorded = await readArchive(directory);
      assert.deepEqual(recorded.issues, []);
      assert.deepEqual(recorded.records.filter(e => e.stage === 'permission').map(e => e.data.outcome), ['blocked']);
      assert.equal(recorded.records.some(e => e.stage === 'execution'), false);
    } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}

test('compiled off during prepared release does not capture a provisional or terminal permission', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-off-commit-')));
  const controlPath = join(cwd, 'control', 'state.json');
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
  const stages: string[] = [];
  let beforeOff = 0;
  const guard = createGuard({ ...host, judge: async r => answer(r.policy),
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath,
    bindRecording: () => stage => { stages.push(stage); },
    onOwnerEvent: event => {
      if (event.type === 'permission' && event.result.permission === 'released') {
        beforeOff = stages.length;
        writeFileSync(controlPath, JSON.stringify({ version: 1, activation: 'off' }));
      }
    } });
  try {
    await guard.setActivation('on');
    const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const call = { callId: 'call', toolName: 'opaque', input: {} };
    const invoke = () => session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
    assert.equal((await invoke()).permission, 'blocked');
    assert.equal(stages.includes('permission'), false);
    assert.ok(beforeOff > 0);
    assert.equal(stages.length, beforeOff);
    assert.equal((await invoke()).bypassReason, 'off');
    await guard.close();
    assert.equal(stages.length, beforeOff);
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});

test('compiled observe handoff stays non-vetoing when owner closes the session', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-observe-handoff-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Never publish.');
  let session!: GuardSession;
  const guard = createGuard({ ...host, judge: async r => answer(r.policy, 'FAIL'),
    env: { TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control', 'state.json'),
    onOwnerEvent: e => { if (e.type === 'permission') void session.close(); } });
  try {
    session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const call = { callId: 'call', toolName: 'opaque', input: {} };
    const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
    assert.equal(result.permission, 'released'); assert.equal(session.status().state, 'closed');
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});

test('compiled enforce keeps off and dormant bypasses distinct from authorization', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-bypass-handoff-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Never publish.');
  await mkdir(join(cwd, 'dormant'));
  const guard = createGuard({ ...host, judge: async r => answer(r.policy, 'FAIL'),
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control', 'state.json') });
  try {
    const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const dormant = guard.openSession({ sessionId: 'two', contextId: 'main' }, join(cwd, 'dormant')); await dormant.ready;
    const call = { callId: 'call', toolName: 'opaque', input: {} };
    assert.equal((await dormant.beforeTool({ ...call, current: () => ({ sessionId: 'two', contextId: 'main', ...call }) })).bypassReason, 'dormant');
    await guard.setActivation('off');
    const off = await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
    assert.equal(off.permission, 'released'); assert.equal(off.bypassReason, 'off'); assert.equal(off.assessment.status, 'not-requested');
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});
