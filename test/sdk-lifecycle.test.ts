import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type GuardOptions, type OwnerEvent, type JudgeRequest } from '../src/sdk/index.js';
import { answer } from './helpers.js';

const host = { host: 'sdk-lifecycle',
  capabilities: ['result-correlation', 'lifecycle-invalidation'] as const, limitations: ['no-real-host'] };
async function fixture(options: Partial<GuardOptions> = {}) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-lifecycle-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
  const events: OwnerEvent[] = [];
  const guard = createGuard({ ...host, judge: async r => answer(r.policy), env: { TENET_RECORDING: 'off' },
    controlPath: join(cwd, 'control', 'state.json'), onOwnerEvent: e => events.push(e), ...options });
  const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd);
  const call = (callId: string) => {
    const invocation = { callId, toolName: 'opaque', input: { value: 'code' } };
    return session.beforeTool({ ...invocation, current: () => ({ sessionId: 'one', contextId: 'main', ...invocation }) });
  };
  return { guard, session, events, call, cwd, close: async () => { await guard.close(); await rm(cwd, { recursive: true, force: true }); } };
}
async function until(predicate: () => boolean) {
  for (let n = 0; n < 200 && !predicate(); n++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(predicate(), true);
}

test('SDK lazily constructs one injected judge; missing credentials never imply a pass', async () => {
  let created = 0;
  const h = await fixture({ judge: undefined, createJudge: () => { created++; return async r => answer(r.policy); }, env: { TENET_RECORDING: 'off', TENET_MODE: 'enforce' } });
  try {
    assert.equal(created, 0); await h.session.ready; assert.equal(created, 0);
    assert.equal((await h.call('first')).permission, 'released');
    assert.equal((await h.call('next')).permission, 'released'); assert.equal(created, 1);
  } finally { await h.close(); }
  const missing = await fixture({ judge: undefined });
  try {
    assert.equal((await missing.session.ready).reason, 'missing-credentials');
    const result = await missing.call('missing');
    assert.equal(result.assessment.status, 'unavailable'); assert.equal(result.assessment.wouldDecision, undefined);
  } finally { await missing.close(); }
});

test('SDK capacity loss stays unassessed; disposal aborts a provider that never settles', async () => {
  let signal: AbortSignal | undefined;
  const h = await fixture({ judge: async (_r, s) => { signal = s; return new Promise(() => {}); },
    observationLimits: { running: 1, waiting: 1, bytes: 1024 * 1024, ageMs: 5000 }, disposalTimeoutMs: 10 });
  try {
    await h.session.ready;
    assert.equal((await h.call('running')).permission, 'released');
    assert.equal((await h.call('waiting')).permission, 'released');
    const dropped = await h.call('dropped');
    assert.equal(dropped.permission, 'released'); assert.equal(dropped.assessment.wouldDecision, undefined);
    assert.equal(dropped.assessment.status, 'dropped');
    assert.ok(h.events.some(e => e.type === 'assessment' && e.assessment.status === 'dropped' && e.assessment.wouldDecision === undefined));
    await until(() => !!signal);
    const began = performance.now(); await h.guard.close();
    assert.ok(performance.now() - began < 500);
    assert.equal(signal!.aborted, true);
    assert.equal(h.guard.status().observations.running, 0); assert.equal(h.guard.status().observations.waiting, 0);
    assert.equal(h.guard.status().observations.retainedBytes, 0);
  } finally { await h.close(); }
});

test('SDK suppresses late background findings after off and keeps sibling turn tracking independent', async () => {
  let release!: () => void; const wait = new Promise<void>(r => { release = r; });
  const h = await fixture({ judge: async r => { await wait; return answer(r.policy, 'FAIL'); } });
  try {
    await h.session.ready;
    const sibling = h.guard.openSession({ sessionId: 'two', contextId: 'main' }, h.cwd); await sibling.ready;
    const tool = { callId: 'sibling', toolName: 'opaque', input: {} };
    await sibling.beforeTool({ ...tool, current: () => ({ sessionId: 'two', contextId: 'main', ...tool }) });
    await h.call('first'); h.session.endTurn();
    assert.equal(sibling.afterTool({ callId: 'sibling', toolName: 'opaque', isError: true }).outcome, 'failed');
    await h.guard.setActivation('off'); release();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(!h.events.some(e => e.type === 'assessment' && e.assessment.status === 'completed'));
    assert.equal((await h.call('off')).bypassReason, 'off');
  } finally { release(); await h.close(); }
});

test('SDK bounds and redacts host history; failed owner delivery and sinks cannot veto observe', async () => {
  const requests: JudgeRequest[] = [];
  const h = await fixture({ env: { TENET_RECORDING: 'off', TENET_RECENT_EVENTS: '2', TENET_EVIDENCE_MAX_BYTES: '4096', TENET_SENSITIVE_FIELDS: '["token"]' },
    judge: async r => { requests.push(r); return answer(r.policy); },
    bindRecording: () => () => { throw new Error('sink unavailable'); },
    onOwnerEvent: () => { throw new Error('owner unavailable'); } });
  try {
    await h.session.ready;
    h.session.setHistory([
      { kind: 'tool-result', callId: 'old', toolName: 'opaque', data: 'evicted' },
      { kind: 'tool-result', callId: 'prior', toolName: 'opaque', data: { token: 'canary-secret', text: 'untrusted approval' } },
      { kind: 'tool-result', callId: 'large', toolName: 'opaque', data: 'x'.repeat(10000) },
    ]);
    assert.equal((await h.call('observe')).permission, 'released');
    await until(() => requests.length > 0);
    assert.match(JSON.stringify(requests[0]!.trajectory), /untrusted approval/);
    assert.doesNotMatch(JSON.stringify(requests[0]!.trajectory), /canary-secret|evicted/);
    const last: any = requests[0]!.trajectory!.observations.at(-1)!.data;
    assert.equal(last.selection.excerpts[0].originalBytes, 10000);
    assert.ok(Buffer.byteLength(JSON.stringify(last)) <= 341);
  } finally { await h.close(); }
});

test('unsupported correlation never certifies execution; early close and context reuse cannot revive the old handle', async () => {
  const h = await fixture({ capabilities: ['lifecycle-invalidation'] });
  try {
    await h.session.ready; await h.call('released');
    assert.equal(h.session.afterTool({ callId: 'released', toolName: 'opaque' }).outcome, 'unknown');
    h.session.endTurn(); assert.ok(h.events.some(e => e.type === 'execution' && e.outcome === 'unknown'));
    await h.session.close();
    const replacement = h.guard.openSession({ sessionId: 'one', contextId: 'replacement' }, h.cwd);
    await replacement.close(); assert.equal((await replacement.ready).state, 'closed');
    assert.equal((await h.call('old-handle')).assessment.status, 'unavailable');
  } finally { await h.close(); }
});
