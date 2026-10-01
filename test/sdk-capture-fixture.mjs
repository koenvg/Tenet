import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard } from 'tenet';

// Relocated compiled entry, run under both Node and Bun without host dependencies.
const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-capture-')));
const judge = async request => ({ model: 'scripted', profile: 'applicability-v1',
  rules: [...request.policy.rules.map(r => r.id), 'builtin:policy-integrity'].map(ruleId => ({ ruleId,
    outcome: { choice: 'PASS', probabilities: { PASS: 1, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0,
      ...(ruleId === 'builtin:policy-integrity' ? {} : { NOT_APPLICABLE: 0 }) } },
    evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } })) });
const records = [];
const guard = createGuard({ host: 'capture-consumer', judge,
  env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control', 'state.json'),
  bindRecording: () => (stage, data) => records.push({ stage, data }) });
try {
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep content local.');
  const unknown = { kind: 'external', health: 'unknown' };
  assert.deepEqual(guard.status().capture, unknown);
  const session = guard.openSession({ sessionId: 'external', contextId: 'main' }, cwd);
  await session.ready;
  const call = { callId: 'call', toolName: 'opaque', input: {} };
  const current = () => ({ sessionId: 'external', contextId: 'main', ...call });
  const result = await session.beforeTool({ ...call, current });
  assert.equal(result.permission, 'released');
  assert.ok(records.some(record => record.stage === 'permission' && record.data.outcome === 'released'));
  assert.deepEqual(guard.status().capture, unknown);
  assert.ok(Object.isFrozen(guard.status().capture));
  await guard.setActivation('off');
  const count = records.length;
  assert.equal((await session.beforeTool({ ...call, callId: 'off', current })).bypassReason, 'off');
  assert.equal(records.length, count);
  assert.deepEqual(guard.status().capture, unknown);
  assert.equal(await guard.close(), true);
  assert.deepEqual(guard.status().capture, unknown);
  // Configured destination stays distinct from activation and archive write success.
  for (const mode of ['observe', 'enforce']) {
    const failedDirectory = join(cwd, `not-a-directory-${mode}`);
    await writeFile(failedDirectory, 'not a directory');
    for (const scenario of [
      { name: 'default-local', env: { TENET_RECORDING_DIR: join(cwd, `archive-${mode}`) }, kind: 'local-archive' },
      { name: 'disabled', env: { TENET_RECORDING: 'off', TENET_RECORDING_DIR: join(cwd, `disabled-${mode}`) }, kind: 'disabled' },
      { name: 'invalid-directory', env: { TENET_RECORDING_DIR: 'relative' }, kind: 'disabled', issue: 'invalid-recording-directory' },
      { name: 'invalid-setting', env: { TENET_RECORDING: 'invalid', TENET_RECORDING_DIR: join(cwd, `invalid-${mode}`) }, kind: 'disabled', issue: 'invalid-recording-setting' },
      { name: 'failed-local', env: { TENET_RECORDING_DIR: failedDirectory }, kind: 'local-archive' },
    ]) {
      const captureEvents = [];
      const local = createGuard({ host: 'capture-consumer', judge, env: { TENET_MODE: mode, ...scenario.env },
        controlPath: join(cwd, `control-${mode}-${scenario.name}`, 'state.json'),
        onOwnerEvent: event => { if (event.type === 'capture') captureEvents.push(event.capture); } });
      try {
        const initial = local.status().capture;
        assert.equal(initial.kind, scenario.kind);
        assert.equal(initial.directory, scenario.env.TENET_RECORDING_DIR);
        assert.equal(initial.issue, scenario.issue);
        assert.equal(initial.failed, 0);
        assert.equal(initial.written, 0);
        assert.equal(initial.dropped, 0);
        assert.equal(initial.pending, 0);
        assert.equal(initial.drainTimeouts, 0);
        assert.equal('enabled' in initial, false);
        const identity = { sessionId: scenario.name, contextId: 'main' };
        const session = local.openSession(identity, cwd);
        await session.ready;
        const result = await session.beforeTool({ ...call, current: () => ({ ...identity, ...call }) });
        assert.equal(result.permission, 'released', `${mode}/${scenario.name}`);
        // Close cancels pending observations and drains SDK-owned writes only.
        assert.equal(await local.close(), true);
        const final = local.status().capture;
        assert.equal(final.kind, scenario.kind);
        assert.equal(final.pending, 0);
        if (scenario.name === 'default-local') assert.ok(final.written > 0);
        else if (scenario.name === 'failed-local') assert.ok(final.failed > 0);
        else assert.equal(final.written, 0);
        if (scenario.name === 'default-local' || scenario.name === 'failed-local') assert.ok(captureEvents.length > 0);
        for (const capture of captureEvents) {
          assert.equal(capture.kind, scenario.kind);
          assert.equal('enabled' in capture, false);
          assert.ok(Object.isFrozen(capture));
        }
      } finally { await local.close(); }
    }
    for (const failure of ['binder', 'sink']) {
      let attempts = 0;
      const external = createGuard({ host: 'capture-consumer', judge,
        env: { TENET_MODE: mode, TENET_RECORDING: 'off' },
        controlPath: join(cwd, `control-${mode}-${failure}`, 'state.json'),
        bindRecording: () => {
          if (failure === 'binder') { attempts++; throw new Error('binding failed'); }
          return () => { attempts++; throw new Error('sink failed'); };
        } });
      try {
        const identity = { sessionId: failure, contextId: 'main' };
        const session = external.openSession(identity, cwd);
        await session.ready;
        const result = await session.beforeTool({ ...call, current: () => ({ ...identity, ...call }) });
        assert.equal(result.permission, 'released', `${mode}/${failure}`);
        assert.ok(attempts > 0);
        assert.deepEqual(external.status().capture, unknown);
        assert.equal(await external.close(), true);
        assert.deepEqual(external.status().capture, unknown);
      } finally { await external.close(); }
    }
  }
} finally {
  await guard.close();
  await rm(cwd, { recursive: true, force: true });
}
console.log('SDK capture status passed');
