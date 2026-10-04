import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unlink, writeFile } from 'node:fs/promises';
import { mkdtemp, realpath, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { GuardRuntime } from '../src/runtime/guard.js';
import { ActivationStore } from '../src/runtime/activation.js';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';

for (const [mode, outcome, expected, blocked] of [
  ['observe', 'PASS', 'ALLOW', false], ['observe', 'APPROVAL_REQUIRED', 'ASK', false],
  ['observe', 'FAIL', 'BLOCK', false], ['enforce', 'PASS', 'ALLOW', false],
  ['enforce', 'FAIL', 'BLOCK', true], ['enforce', 'APPROVAL_REQUIRED', 'BLOCK', true],
] as const) {
  test(`Pi baseline ${mode}/${outcome}`, async () => {
    const h = await guardHarness({ hasUI: false, env: { TENET_MODE: mode }, judge: async request => answer(request.policy, outcome) });
    try {
      await h.start();
      assert.equal((await h.call())?.block === true, blocked);
      if (mode === 'observe') await h.assessed();
      const permission = h.records.find(r => r.stage === 'permission');
      assert.equal(permission.wouldDecision, mode === 'observe' ? undefined : expected);
      assert.equal(h.records.find(r => r.stage === 'decision')?.decision, mode === 'enforce' && outcome === 'APPROVAL_REQUIRED' ? 'ASK' : expected);
      assert.equal(permission.outcome, blocked ? 'blocked' : 'released');
      assert.equal(h.prompts.length, 0);
    } finally { await h.close(); }
  });
}


test('Pi owner status distinguishes configured mode from coverage limits', async () => {
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' } });
  try {
    await h.start();
    await h.commands.get('tenet').handler('status', h.ctx);
    const summary = h.notifications.at(-1)!;
    assert.match(summary, /TENET ON ENFORCE/);
    assert.match(summary, /adapter pi version unverified/);
    assert.match(summary, /coverage result correlation, argument stability/);
    assert.match(summary, /native-result-has-no-invocation-id/);
    assert.match(summary, /target-resolution-unavailable/);
  } finally { await h.close(); }
});
test('Pi baseline WARN cannot veto; missing judge and stale policy remain unavailable', async () => {
  const warn = await guardHarness({ policy: 'Rule; WARN; Keep edits focused.', env: { TENET_MODE: 'enforce' }, judge: async r => answer(r.policy, 'FAIL') });
  try {
    await warn.start();
    assert.equal(await warn.call(), undefined);
    assert.equal(warn.records.find(r => r.stage === 'permission')?.wouldDecision, 'ALLOW');
  } finally { await warn.close(); }
  const missing = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: null });
  try {
    await missing.start();
    assert.equal((await missing.call())?.block, true);
    assert.equal(missing.records.find(r => r.stage === 'permission')?.reason, 'missing-credentials');
  } finally { await missing.close(); }
  const stale = await guardHarness({ env: { TENET_MODE: 'enforce' } });
  try {
    await stale.start();
    await unlink(stale.file);
    assert.equal((await stale.call())?.block, true);
    assert.equal(stale.records.find(r => r.stage === 'permission')?.reason, 'policy-stale');
    await writeFile(stale.file, 'Rule; Never commit.');
    assert.equal((await stale.call('next'))?.block, true);
  } finally { await stale.close(); }
});

test('Pi baseline dormant session has no evidence in either mode', async () => {
  for (const mode of ['observe', 'enforce']) {
    const h = await guardHarness({ localPolicy: false, env: { TENET_MODE: mode } });
    try {
      await h.start();
      assert.equal(await h.call(), undefined);
      assert.deepEqual(h.records, []);
    } finally { await h.close(); }
  }
});

const capabilities = { host: 'fixture', version: 'fixture-1', profile: 'embedded', interception: false, resultCorrelation: true,
  lifecycleInvalidation: true, argumentStability: false, trustedApproval: false, limitations: ['no-host-dispatch'] };
async function embedded(mode: 'observe' | 'enforce', judgeOutcome: 'PASS' | 'FAIL' | 'APPROVAL_REQUIRED', policy = 'Rule; BLOCK; Never commit.') {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-runtime-')));
  const file = join(cwd, 'TENET.md');
  await writeFile(file, policy);
  const events: { stage: string; data: Record<string, unknown> }[] = [];
  const runtime = new GuardRuntime({ env: { TENET_MODE: mode }, activation: new ActivationStore(join(cwd, 'control.json')),
    judge: async request => answer(request.policy, judgeOutcome), emit: (stage, data) => events.push({ stage, data }),
  }, capabilities);
  const session = { host: 'fixture', sessionId: 's', contextId: 'parent' };
  await runtime.start(session, cwd);
  assert.equal(runtime.coverageStatus().adapter.host, 'fixture');
  assert.equal(runtime.coverageStatus().adapter.version, 'fixture-1');
  assert.equal(runtime.coverageStatus().adapter.trustedApproval, false);
  assert.equal(runtime.coverageStatus().mode, mode);
  assert.equal(runtime.coverageStatus().readiness.eligible, true);
  const call = (callId: string, input: unknown = { path: 'README.md' }, contextId = 'parent') => {
    const invocation = { ...session, contextId, cwd, callId, toolName: 'edit', input };
    return runtime.call({ ...invocation, current: () => invocation });
  };
  return { runtime, cwd, file, events, session, call, close: () => rm(cwd, { recursive: true, force: true }) };
}

for (const mode of ['observe', 'enforce'] as const) {
  test(`embedded ${mode}: one stale override cannot replace session-local policies`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-local-runtime-')));
    const { mkdir } = await import('node:fs/promises');
    const submitted: string[][] = [], events: string[] = [];
    const external = join(root, 'external.md');
    await writeFile(external, 'Rule; external rule');
    const runtime = new GuardRuntime({ env: { TENET_MODE: mode, TENET_POLICY: external },
      activation: new ActivationStore(join(root, 'control.json')),
      judge: async request => { submitted.push(request.policy.rules.map(rule => rule.text)); return answer(request.policy); },
      emit: stage => { events.push(stage); } }, capabilities);
    try {
      for (const name of ['first', 'second', 'absent']) {
        const cwd = join(root, name);
        await mkdir(cwd);
        if (name !== 'absent') await writeFile(join(cwd, 'TENET.md'), `Rule; ${name} local rule`);
        const identity = { host: 'fixture', sessionId: name, contextId: 'main' };
        await runtime.start(identity, cwd);
        assert.equal(runtime.readiness.eligible, name !== 'absent');
        if (name !== 'absent') assert.equal(runtime.readiness.policy.source, join(cwd, 'TENET.md'));
        const invocation = { ...identity, cwd, callId: name, toolName: 'edit', input: {} };
        const before = events.length;
        assert.equal(await runtime.call({ ...invocation, current: () => invocation }), undefined);
        if (name === 'absent') assert.equal(events.length, before);
        else if (mode === 'observe') {
          for (let i = 0; submitted.length < (name === 'first' ? 1 : 2) && i < 400; i++) await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
      assert.deepEqual(submitted, [['first local rule'], ['second local rule']]);
    } finally { runtime.shutdown(); await rm(root, { recursive: true, force: true }); }
  });
}

for (const mode of ['observe', 'enforce'] as const) {
  for (const outcome of ['PASS', 'FAIL', 'APPROVAL_REQUIRED'] as const) {
    test(`embedded ${mode}/${outcome} retains Pi assessment and has no implicit approval`, async () => {
      const pi = await guardHarness({ policy: 'Rule; BLOCK; Never commit.', hasUI: false, env: { TENET_MODE: mode }, judge: async r => answer(r.policy, outcome) });
      const headless = await embedded(mode, outcome);
      try {
        await pi.start();
        const piPermission = (await pi.call('fixture'), pi.records.find(r => r.stage === 'permission'));
        const block = await headless.call('fixture');
        const permission = headless.events.find(e => e.stage === 'permission')!.data;
        if (mode === 'observe') {
          await pi.assessed('fixture');
          for (let i = 0; !headless.events.some(e => e.stage === 'assessment-status' && e.data.status === 'completed') && i < 400; i++)
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.equal(headless.events.find(e => e.stage === 'decision')!.data.decision, pi.records.find(r => r.stage === 'decision')!.decision);
        assert.deepEqual(permission.diagnostics, piPermission.diagnostics);
        assert.equal(permission.assessmentAvailable, piPermission.assessmentAvailable);
        assert.equal(block?.block, mode === 'enforce' && outcome !== 'PASS' ? true : undefined);
        if (mode === 'enforce' && outcome === 'APPROVAL_REQUIRED') {
          assert.equal(permission.wouldDecision, 'ASK');
          assert.equal(permission.reason, 'approval-unavailable');
          assert.ok(!headless.events.some(e => e.stage === 'approval'));
        } else assert.equal(permission.wouldDecision, piPermission.wouldDecision);
      } finally { await pi.close(); await headless.close(); }
    });
  }
}

test('headless WARN finding releases, unavailable blocks enforce, dormant never records', async () => {
  const warn = await embedded('enforce', 'FAIL', 'Rule; WARN; Keep edits focused.');
  try {
    assert.equal(await warn.call('warn'), undefined);
    assert.equal(warn.events.find(e => e.stage === 'permission')?.data.wouldDecision, 'ALLOW');
    await unlink(warn.file);
    assert.equal((await warn.call('stale'))?.block, true);
    assert.equal(warn.events.find(e => e.stage === 'permission' && e.data.callId === 'stale')?.data.reason, 'policy-stale');
    assert.equal((await warn.call('latched'))?.block, true);
  } finally { await warn.close(); }
  const dormant = await embedded('enforce', 'PASS');
  try {
    await unlink(dormant.file);
    await dormant.runtime.start(dormant.session, dormant.cwd);
    assert.equal(await dormant.call('none'), undefined);
    assert.deepEqual(dormant.events, []);
  } finally { await dormant.close(); }
});

test('headless duplicate ID and changed arguments never release; context invalidation is scoped', async () => {
  const h = await embedded('enforce', 'PASS');
  try {
    assert.equal(await h.call('same'), undefined);
    assert.equal((await h.call('same'))?.block, true);
    const changed = { payload: 'original' };
    const invocation = { ...h.session, cwd: h.cwd, callId: 'changed', toolName: 'edit', input: changed };
    assert.equal((await h.runtime.call({ ...invocation, current: () => ({ ...invocation, input: { payload: 'modified' } }) }))?.block, true);
    const before = h.events.filter(e => e.stage === 'execution').length;
    assert.equal(await h.call('same', { path: 'other' }, 'child'), undefined);
    h.runtime.invalidate('child-end', { ...h.session, contextId: 'child' });
    const later = h.events.filter(e => e.stage === 'execution').slice(before);
    assert.equal(later.length, 1);
    assert.equal(later[0]!.data.outcome, 'unknown');
    assert.equal(later[0]!.data.contextId, 'child');
  } finally { await h.close(); }
});

test('untrusted approval callback cannot grant ASK, and child cancellation leaves sibling pending', async () => {
  const h = await embedded('enforce', 'APPROVAL_REQUIRED');
  try {
    let called = false;
    const call = { ...h.session, cwd: h.cwd, callId: 'ask', toolName: 'edit', input: { path: 'readme' } };
    const denial = await h.runtime.call({ ...call, current: () => call, approve: async () => { called = true; return 'approved'; } });
    assert.equal(denial?.block, true);
    assert.equal(called, false);
    assert.equal(h.events.find(e => e.stage === 'permission')?.data.wouldDecision, 'ASK');
  } finally { await h.close(); }
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-context-')));
  try {
    await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Never commit.');
    const waits = new Map<string, (value: ReturnType<typeof answer>) => void>();
    const events: { stage: string; data: Record<string, unknown> }[] = [];
    const runtime = new GuardRuntime({ env: { TENET_MODE: 'enforce' }, activation: new ActivationStore(join(cwd, 'control.json')),
      judge: request => new Promise(done => { waits.set(request.action.callId, value => done(value)); }),
      emit: (stage, data) => events.push({ stage, data }),
    }, capabilities);
    const session = { host: 'fixture', sessionId: 's', contextId: 'parent' };
    await runtime.start(session, cwd);
    const invoke = (contextId: string, callId: string) => {
      const invocation = { ...session, contextId, cwd, callId, toolName: 'edit', input: { path: callId } };
      return runtime.call({ ...invocation, current: () => invocation });
    };
    const parent = invoke('parent', 'one'), child = invoke('child', 'two');
    for (let i = 0; waits.size !== 2 && i < 100; i++) await new Promise(done => setTimeout(done, 1));
    assert.equal(waits.size, 2);
    runtime.invalidate('child-end', { ...session, contextId: 'child' });
    assert.equal((await child)?.block, true);
    waits.get('one')!(answer(runtime.readiness.policy as Extract<typeof runtime.readiness.policy, { available: true }>));
    assert.equal(await parent, undefined);
    waits.get('two')!(answer(runtime.readiness.policy as Extract<typeof runtime.readiness.policy, { available: true }>));
    await new Promise(done => setTimeout(done, 0));
    assert.equal(events.filter(e => e.stage === 'permission' && e.data.outcome === 'released').length, 1);
    assert.equal(events.find(e => e.stage === 'permission' && e.data.outcome === 'released')?.data.contextId, 'parent');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('host/session policy stays isolated and starting a sibling does not revoke pending work', async () => {
  const first = await realpath(await mkdtemp(join(tmpdir(), 'tenet-first-')));
  const second = await realpath(await mkdtemp(join(tmpdir(), 'tenet-second-')));
  try {
    await writeFile(join(first, 'TENET.md'), 'Rule; BLOCK; First policy.');
    await writeFile(join(second, 'TENET.md'), 'Rule; BLOCK; Second policy.');
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>(done => { release = done; });
    const entered = new Promise<void>(done => { started = done; });
    const selected: string[] = [];
    const events: { stage: string; data: Record<string, unknown> }[] = [];
    const runtime = new GuardRuntime({ env: { TENET_MODE: 'enforce' }, activation: new ActivationStore(join(first, 'control.json')),
      judge: async request => { selected.push(request.policy.source); if (request.action.callId === 'held') { started(); await held; } return answer(request.policy); },
      emit: (stage, data) => events.push({ stage, data }),
    }, capabilities);
    const a = { host: 'fixture', sessionId: 'same', contextId: 'parent' };
    const b = { host: 'fixture', sessionId: 'other', contextId: 'parent' };
    await runtime.start(a, first);
    const invoke = (session: typeof a, cwd: string, callId: string) => {
      const input = { path: callId };
      const call = { ...session, cwd, callId, toolName: 'edit', input };
      return runtime.call({ ...call, current: () => call });
    };
    assert.equal((await invoke({ ...a, host: 'foreign' }, second, 'foreign'))?.block, true);
    assert.equal(events.length, 0);
    await assert.rejects(runtime.start({ ...a, host: 'foreign' }, second), /host-mismatch/);
    const pending = invoke(a, first, 'held');
    await entered;
    await runtime.start(b, second);
    assert.equal(await invoke(b, second, 'sibling'), undefined);
    release();
    assert.equal(await pending, undefined);
    assert.deepEqual(selected, [join(first, 'TENET.md'), join(second, 'TENET.md')]);
    assert.equal(events.filter(e => e.stage === 'permission' && e.data.outcome === 'released').length, 2);
    assert.equal(runtime.coverageStatus(a).readiness.policy.available, true);
    assert.equal(runtime.coverageStatus(b).readiness.policy.available, true);
  } finally { await rm(first, { recursive: true, force: true }); await rm(second, { recursive: true, force: true }); }
});

test('runtime import graph does not depend on Pi or interactive UI', async () => {
  const visited = new Set<string>();
  const walk = async (path: string): Promise<void> => {
    if (visited.has(path)) return;
    visited.add(path);
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /@earendil-works\/pi-coding-agent|(?:from|import\()\s*['\"][^'\"]*(?:\/pi\/|\/inspector\/)/);
    for (const match of text.matchAll(/from\s+['\"](\.[^'\"]+)['\"]/g)) {
      const next = resolve(dirname(path), match[1]!.replace(/\.js$/, '.ts'));
      await walk(next);
    }
  };
  await walk(resolve('src/runtime/guard.ts'));
  assert.ok(visited.size > 5);
});
