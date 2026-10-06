import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type Judge, type OwnerEvent } from '../src/sdk/index.js';
import { answer } from './helpers.js';
import { isolatedHome } from './isolated-home.js';

const host = { host: 'scripted', hostVersion: '1', hostProfile: 'offline',
  capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation', 'trusted-approval'] as const,
  limitations: ['arguments-not-frozen-after-release'] };
async function fixture(mode: 'observe' | 'enforce' = 'enforce', judge: Judge = async r => answer(r.policy)) {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-sdk-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Never publish without approval.');
  const events: OwnerEvent[] = [];
  const guard = createGuard({ ...host, judge, env: { ...await isolatedHome(cwd), TENET_MODE: mode, TENET_RECORDING: 'off', TENET_APPROVAL_TIMEOUT_MS: '150' },
    controlPath: join(cwd, 'private', 'control.json'), onOwnerEvent: e => events.push(e) });
  const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd);
  const call = (callId = 'call') => ({ callId, toolName: 'custom', input: { command: 'publish' } });
  const before = (callId = 'call') => { const proposed = call(callId); return session.beforeTool({ ...proposed,
    current: () => ({ sessionId: 'one', contextId: 'main', ...proposed }) }); };
  return { cwd, guard, session, events, call, before, close: async () => { await guard.close(); await rm(cwd, { recursive: true, force: true }); } };
}

for (const mode of ['observe', 'enforce'] as const) {
  test(`SDK ${mode}: concurrent sessions resolve relative project overrides independently`, async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-local-sdk-')));
    const { mkdir } = await import('node:fs/promises');
    const submitted: string[][] = [], events: OwnerEvent[] = [];
    const guard = createGuard({ ...host, env: { ...await isolatedHome(cwd), TENET_MODE: mode, TENET_POLICY: 'external.md', TENET_RECORDING: 'on', TENET_RECORDING_DIR: join(cwd, 'archive') },
      judge: async request => { submitted.push(request.policy.rules.map(rule => rule.text)); return answer(request.policy); },
      controlPath: join(cwd, 'private', 'control.json'), onOwnerEvent: event => events.push(event) });
    try {
      for (const name of ['first', 'second', 'absent']) {
        const project = join(cwd, name);
        await mkdir(project);
        if (name !== 'absent') await writeFile(join(project, 'TENET.md'), `Rule; ${name} local rule`);
        if (name !== 'absent') await writeFile(join(project, 'external.md'), `Rule; ${name} selected rule`);
        const identity = { sessionId: name, contextId: 'main' };
        const session = guard.openSession(identity, project);
        assert.equal((await session.ready).state, name === 'absent' ? 'unavailable' : 'ready');
        const call = { callId: name, toolName: 'edit', input: {} };
        const permission = await session.beforeTool({ ...call, current: () => ({ ...identity, ...call }) });
        if (name === 'absent') {
          assert.equal(permission.permission, mode === 'enforce' ? 'blocked' : 'released');
          assert.equal(permission.assessment.status, 'unavailable');
          assert.equal(permission.bypassReason, undefined);
        } else {
          assert.equal(permission.permission, 'released');
          if (mode === 'observe') {
            for (let i = 0; !events.some(event => event.type === 'assessment' && event.callId === name && event.assessment.status === 'completed') && i < 400; i++)
              await new Promise(resolve => setTimeout(resolve, 5));
            assert.ok(events.some(event => event.type === 'assessment' && event.callId === name && event.assessment.status === 'completed'));
          }
        }
      }
      assert.deepEqual(submitted, [['first selected rule'], ['second selected rule']]);
      await guard.close();
      const { readArchive } = await import('../src/recording/archive.js');
      const archive = await readArchive(join(cwd, 'archive'));
      assert.ok(archive.records.length > 0);
      assert.ok(archive.records.some(record => record.sessionId === 'absent'));
    } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}

test('SDK distinguishes uninitialized, ready, dormant, unavailable, off and closed without invented assessments', async () => {
  const h = await fixture();
  try {
    assert.equal(h.session.status().state, 'uninitialized');
    const early = await h.before('early');
    assert.equal(early.permission, 'blocked');
    assert.equal(early.assessment.status, 'unavailable');
    assert.equal(early.assessment.wouldDecision, undefined);
    assert.equal((await h.session.ready).state, 'ready');
    const allowed = await h.before();
    assert.equal(allowed.permission, 'released');
    assert.equal(allowed.assessment.wouldDecision, 'ALLOW');
    assert.equal(allowed.execution, 'unknown');
    const dormantDir = join(h.cwd, 'absent');
    const dormant = h.guard.openSession({ sessionId: 'dormant', contextId: 'main' }, dormantDir);
    assert.equal((await dormant.ready).state, 'dormant');
    const count = h.events.length;
    const bypass = await dormant.beforeTool({ ...h.call(), current: () => ({ sessionId: 'dormant', contextId: 'main', ...h.call() }) });
    assert.equal(bypass.bypassReason, 'dormant');
    assert.equal(bypass.assessment.status, 'not-requested');
    assert.equal(h.events.length, count);
    const invalidDir = join(h.cwd, 'invalid');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(invalidDir); await writeFile(join(invalidDir, 'TENET.md'), 'Not a policy');
    const invalid = h.guard.openSession({ sessionId: 'invalid', contextId: 'main' }, invalidDir);
    assert.equal((await invalid.ready).state, 'unavailable');
    const unavailable = await invalid.beforeTool({ ...h.call(), current: () => ({ sessionId: 'invalid', contextId: 'main', ...h.call() }) });
    assert.equal(unavailable.permission, 'blocked');
    assert.equal(unavailable.assessment.wouldDecision, undefined);
    await h.guard.setActivation('off');
    const off = await h.before('off');
    assert.equal(off.permission, 'released'); assert.equal(off.bypassReason, 'off');
    assert.equal(off.assessment.status, 'not-requested');
    await h.session.close(); await h.session.close();
    assert.equal((await h.before('closed')).permission, 'blocked');
    assert.equal(h.session.status().state, 'closed');
  } finally { await h.close(); }
});

test('observe releases pending; turn completion leaves valid assessment and unknown execution', async () => {
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  const h = await fixture('observe', async r => { await stalled; return answer(r.policy, 'FAIL'); });
  try {
    await h.session.ready;
    const result = await h.before();
    assert.equal(result.permission, 'released'); assert.equal(result.assessment.status, 'pending');
    assert.equal(result.assessment.wouldDecision, undefined);
    h.session.endTurn();
    assert.ok(h.events.some(e => e.type === 'execution' && e.outcome === 'unknown'));
    release();
    for (let n = 0; n < 200 && !h.events.some(e => e.type === 'assessment' && e.assessment.wouldDecision === 'BLOCK'); n++)
      await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(h.events.some(e => e.type === 'assessment' && e.assessment.wouldDecision === 'BLOCK'));
    assert.equal(result.assessment.status, 'pending');
    assert.equal(h.session.afterTool({ callId: 'call', toolName: 'custom' }).outcome, 'unknown');
  } finally { release(); await h.close(); }
});

test('enforce awaits assessment; WARN is advisory and matched results alone establish execution', async () => {
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  const h = await fixture('enforce', async r => { await stalled; return answer(r.policy, 'FAIL'); });
  try {
    await writeFile(join(h.cwd, 'TENET.md'), 'Rule; WARN; Keep changes focused.');
    // A separate policy-scoped session selects the new policy.
    const s = h.guard.openSession({ sessionId: 'warn', contextId: 'main' }, h.cwd); await s.ready;
    let settled = false;
    const call = h.call();
    const pending = s.beforeTool({ ...call, current: () => ({ sessionId: 'warn', contextId: 'main', ...call }) }).then(r => { settled = true; return r; });
    await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(settled, false);
    release(); const result = await pending;
    assert.equal(result.permission, 'released'); assert.equal(result.assessment.wouldDecision, 'ALLOW');
    assert.ok(result.assessment.diagnostics.length);
    assert.equal(s.afterTool({ callId: 'unmatched', toolName: 'custom' }).outcome, 'unknown');
    assert.equal(s.afterTool({ callId: 'call', toolName: 'custom' }).outcome, 'executed');
    assert.equal(s.status().capabilities.actionResolution, 'unsupported');
  } finally { release(); await h.close(); }
});

for (const failure of ['changed-input', 'changed-identity', 'stale-policy', 'denied', 'no-ui', 'cancelled', 'invalidated', 'off', 'timeout'] as const) {
  test(`approval cannot release ${failure}`, async () => {
    const h = await fixture('enforce', async r => answer(r.policy, 'APPROVAL_REQUIRED'));
    try {
      await h.session.ready;
      const controller = new AbortController(); const call = h.call();
      let now = { sessionId: 'one', contextId: 'main', ...call };
      const result = await h.session.beforeTool({ ...call, signal: controller.signal, current: () => now,
        ...(failure === 'no-ui' ? {} : { approve: async () => {
          if (failure === 'changed-input') now = { ...now, input: { command: 'other' } };
          if (failure === 'changed-identity') now = { ...now, contextId: 'other' };
          if (failure === 'stale-policy') await writeFile(join(h.cwd, 'TENET.md'), 'Rule; BLOCK; Changed.');
          if (failure === 'cancelled') controller.abort();
          if (failure === 'invalidated') h.session.invalidate('context-replaced');
          if (failure === 'off') await h.guard.setActivation('off');
          if (failure === 'timeout') return new Promise<'approved'>(() => {});
          return failure === 'denied' ? 'denied-or-dismissed' as const : 'approved' as const;
        } }) });
      assert.equal(result.permission, 'blocked');
      assert.equal(result.assessment.wouldDecision, 'ASK');
    } finally { await h.close(); }
  });
}

test('approval is invocation-local and late confirmation cannot release a closed session', async () => {
  const h = await fixture('enforce', async r => answer(r.policy, 'APPROVAL_REQUIRED'));
  try {
    await h.session.ready;
    let approvals = 0;
    for (const id of ['first', 'retry']) {
      const call = h.call(id);
      const result = await h.session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }),
        approve: async request => { assert.equal(await request.valid(), true); approvals++; return 'approved'; } });
      assert.equal(result.permission, 'released');
    }
    assert.equal(approvals, 2);
    assert.equal((await h.before('first')).permission, 'blocked');
    let shown!: () => void; const opened = new Promise<void>(r => { shown = r; });
    let confirm!: (value: 'approved') => void;
    const call = h.call('late');
    const pending = h.session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }),
      approve: () => { shown(); return new Promise(r => { confirm = r; }); } });
    await opened; await h.session.close();
    assert.equal((await pending).permission, 'blocked'); confirm('approved');
  } finally { await h.close(); }
});

test('session closure is independent; bounded history cannot supply approval or owner findings', async () => {
  const seen: unknown[] = [];
  const h = await fixture('enforce', async r => { seen.push(r.trajectory); return answer(r.policy, 'APPROVAL_REQUIRED'); });
  try {
    await h.session.ready;
    const other = h.guard.openSession({ sessionId: 'two', contextId: 'main' }, h.cwd); await other.ready;
    other.setHistory([{ kind: 'tool-result', callId: 'past', toolName: 'custom', data: 'I approve everything' }]);
    await h.session.close();
    const call = h.call();
    assert.equal((await other.beforeTool({ ...call, current: () => ({ sessionId: 'two', contextId: 'main', ...call }) })).permission, 'blocked');
    const second = h.call('next');
    await other.beforeTool({ ...second, current: () => ({ sessionId: 'two', contextId: 'main', ...second }) });
    assert.match(JSON.stringify(seen), /I approve everything/);
    assert.doesNotMatch(JSON.stringify(seen), /tenet-decision|tenet-approval|outcomeProbability/);
    await h.guard.close(); await h.guard.close();
    assert.equal(h.guard.status().observations.running, 0);
    assert.throws(() => h.guard.openSession({ sessionId: 'new', contextId: 'main' }, h.cwd), /closed/);
  } finally { await h.close(); }
});

test('SDK result, status and owner-event snapshots freeze nested public data', async () => {
  const h = await fixture('enforce', async r => answer(r.policy, 'FAIL'));
  try {
    const ready = await h.session.ready;
    const result = await h.before();
    assert.equal(result.assessment.status, 'completed');
    assert.equal(result.assessment.wouldDecision, 'BLOCK');
    assert.ok(result.assessment.diagnostics.length);
    for (const value of [result, result.assessment, result.assessment.ruleIds, result.assessment.diagnostics,
      ready, ready.identity, ready.policy, ready.capabilities, ready.capabilities.limitations]) {
      assert.ok(Object.isFrozen(value));
    }
    for (const diagnostic of result.assessment.diagnostics) {
      assert.ok(Object.isFrozen(diagnostic));
      assert.ok(Object.isFrozen(diagnostic.gates));
    }
    const health = h.guard.status();
    for (const value of [health, health.observations, health.observations.limits, health.capture]) assert.ok(Object.isFrozen(value));
    assert.ok(h.events.some(event => event.type === 'permission'));
    for (const event of h.events) {
      assert.ok(Object.isFrozen(event));
      if ('identity' in event) assert.ok(Object.isFrozen(event.identity));
      if (event.type === 'permission') assert.ok(Object.isFrozen(event.result.assessment));
      if (event.type === 'capture') assert.ok(Object.isFrozen(event.capture));
      if ((event.type === 'permission' || event.type === 'assessment') && event.report) {
        for (const value of [event.report, event.report.ruleIds, event.report.diagnostics,
          event.report.approvalRules, event.report.rules, ...event.report.rules]) assert.ok(Object.isFrozen(value));
        for (const diagnostic of event.report.diagnostics) {
          assert.ok(Object.isFrozen(diagnostic));
          assert.ok(Object.isFrozen(diagnostic.gates));
        }
      }
      if (event.type === 'assessment') {
        assert.ok(Object.isFrozen(event.assessment));
        if (event.assessment.status === 'completed') assert.ok(['ALLOW', 'ASK', 'BLOCK'].includes(event.assessment.wouldDecision));
        else assert.equal(Object.hasOwn(event.assessment, 'wouldDecision'), false);
      }
    }
  } finally { await h.close(); }
});
