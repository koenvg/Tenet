import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GuardRuntime } from '../src/runtime/guard.js';
import { ActivationStore } from '../src/runtime/activation.js';
import { answer } from './helpers.js';
import type { PolicySet } from '../src/decision/contracts.js';
import { guardHarness } from './guard-harness.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate: () => boolean) {
  for (let i = 0; i < 400 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(predicate(), 'background checkpoint timed out');
}
const capabilities = { host: 'fixture', version: '1', profile: 'test', interception: true, resultCorrelation: true,
  lifecycleInvalidation: true, argumentStability: true, trustedApproval: false, limitations: [] };

test('Pi releases before judge; result-before-assessment remains independent and owner-only', async () => {
  let resolve!: (value: unknown) => void;
  let selected!: PolicySet;
  const h = await guardHarness({ judge: request => { selected = request.policy; return new Promise(done => { resolve = done; }); } });
  try {
    await h.start();
    assert.equal(await h.call(), undefined);
    const permission = h.records.find(r => r.stage === 'permission');
    assert.equal(permission.outcome, 'released');
    assert.equal(permission.wouldDecision, undefined);
    assert.equal(h.records.find(r => r.stage === 'assessment-status')?.status, 'pending');
    await h.emit('tool_result', { toolName: 'edit', toolCallId: 'c', isError: false });
    await h.emit('agent_end');
    await until(() => !!resolve);
    resolve(answer(selected, 'FAIL'));
    await h.assessed('c');
    assert.equal(h.records.find(r => r.stage === 'execution')?.outcome, 'unknown');
    assert.equal(h.records.findLast(r => r.stage === 'assessment-status')?.status, 'completed');
    assert.equal(h.records.find(r => r.stage === 'decision')?.decision, 'BLOCK');
    assert.equal(h.records.filter(r => r.stage === 'permission').length, 1);
    assert.equal(h.prompts.length, 0);
    assert.ok(!h.records.some(r => r.stage === 'message'));
  } finally { await h.close(); }
});

test('shared runtime bounds running/waiting work, drops excess and cancels on invalidation', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-background-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; Never commit.');
  const events: { stage: string; data: Record<string, any> }[] = [];
  const starts: string[] = [];
  const runtime = new GuardRuntime({ env: { TENET_MODE: 'observe' }, activation: new ActivationStore(join(cwd, 'control')),
    judge: request => { starts.push(request.action.callId); return new Promise(() => {}); },
    observationLimits: { running: 1, waiting: 1, bytes: 100000, ageMs: 20 },
    emit: (stage, data) => events.push({ stage, data }),
  }, capabilities);
  const id = { host: 'fixture', sessionId: 's', contextId: 'main' };
  try {
    await runtime.start(id, cwd);
    assert.equal(runtime.readiness.unavailable, undefined, JSON.stringify(runtime.readiness));
    for (const callId of ['one', 'two', 'three']) {
      const call = { ...id, cwd, callId, toolName: 'edit', input: { path: callId } };
      assert.equal(await runtime.call({ ...call, current: () => call }), undefined);
    }
    await until(() => starts.length > 0);
    assert.deepEqual(starts, ['one'], JSON.stringify(events.map(e => [e.stage, e.data.reason, e.data.status])));
    assert.equal(events.find(e => e.stage === 'assessment-status' && e.data.callId === 'three' && e.data.status === 'dropped')?.data.reason, 'queue-capacity');
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(events.find(e => e.stage === 'assessment-status' && e.data.callId === 'two' && e.data.status === 'dropped')?.data.reason, 'queue-expired');
    runtime.invalidate('session-switch');
    assert.equal(events.findLast(e => e.stage === 'assessment-status' && e.data.callId === 'one')?.data.status, 'cancelled');
  } finally { runtime.shutdown(); await rm(cwd, { recursive: true, force: true }); }
});

test('queued work uses the captured action and history despite later mutation and result evidence', async () => {
  let resolve!: (value: unknown) => void;
  let observed: any;
  const h = await guardHarness({ judge: request => { observed = request; return new Promise(done => { resolve = done; }); } });
  try {
    await h.start();
    const input = { path: 'README.md', text: 'before' };
    assert.equal(await h.call('one', input), undefined);
    input.text = 'after';
    await h.emit('tool_result', { toolCallId: 'one', toolName: 'edit', content: 'result-before-assessment' });
    await until(() => !!observed);
    assert.equal(observed.action.arguments.text, 'before');
    assert.equal(observed.trajectory.observations.some((item: any) => item.origin.includes('tool-result')), false);
    assert.ok(Object.isFrozen(observed.action));
    resolve(answer(observed.policy));
    assert.equal((await h.assessed('one')).status, 'completed');
    assert.equal(h.records.find(r => r.stage === 'execution')?.outcome, 'unknown');
    assert.ok(h.records.findIndex(r => r.stage === 'execution') < h.records.findIndex(r => r.stage === 'assessment'));
  } finally { await h.close(); }
});

test('off suppresses late findings and frees a stalled provider slot', async () => {
  let resolve!: (value: unknown) => void;
  const h = await guardHarness({ judge: () => new Promise(done => { resolve = done; }) });
  try {
    await h.start(); await h.call('one'); await until(() => !!resolve);
    const before = h.records.length;
    await h.commands.get('tenet').handler('off', h.ctx);
    resolve(answer()); await tick();
    assert.equal(h.records.length, before);
    assert.equal(h.records.some(r => r.stage === 'decision' && r.callId === 'one'), false);
  } finally { await h.close(); }
});

test('byte budget drops an oversized snapshot without submitting or inventing a decision', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bytes-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; Never commit.');
  let submissions = 0;
  const events: { stage: string; data: Record<string, any> }[] = [];
  const runtime = new GuardRuntime({ env: { TENET_MODE: 'observe' }, activation: new ActivationStore(join(cwd, 'control')),
    judge: async request => { submissions++; return answer(request.policy); },
    observationLimits: { bytes: 200 }, emit: (stage, data) => events.push({ stage, data }),
  }, capabilities);
  const id = { host: 'fixture', sessionId: 's', contextId: 'main', cwd, callId: 'large', toolName: 'edit', input: { text: 'x'.repeat(10000) } };
  try {
    await runtime.start(id, cwd);
    assert.equal(await runtime.call({ ...id, current: () => id }), undefined);
    await tick();
    assert.equal(submissions, 0);
    assert.equal(events.find(e => e.stage === 'assessment-status' && e.data.status === 'dropped')?.data.reason, 'snapshot-capacity');
    assert.equal(events.find(e => e.stage === 'permission')?.data.wouldDecision, undefined);
    assert.equal(events.some(e => e.stage === 'decision'), false);
  } finally { runtime.shutdown(); await rm(cwd, { recursive: true, force: true }); }
});

test('oversized input is dropped before metadata inspection, copying or evaluator submission', async () => {
  let inspected = 0, judged = 0;
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-oversized-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; Never commit.');
  const events: { stage: string; data: Record<string, any> }[] = [];
  const runtime = new GuardRuntime({ env: { TENET_MODE: 'observe' }, activation: new ActivationStore(join(cwd, 'control')),
    judge: async r => { judged++; return answer(r.policy); }, observationLimits: { bytes: 1024 },
    emit: (stage, data) => events.push({ stage, data }),
  }, capabilities);
  const id = { host: 'fixture', sessionId: 's', contextId: 'main', cwd, callId: 'huge', toolName: 'edit', input: { text: 'x'.repeat(10_000_000) } };
  try {
    await runtime.start(id, cwd);
    assert.equal(await runtime.call({ ...id, metadata: () => { inspected++; throw new Error('should not inspect'); }, current: () => id }), undefined);
    assert.equal(inspected, 0); assert.equal(judged, 0);
    assert.equal(events.find(e => e.stage === 'assessment-status')?.data.status, 'dropped');
    assert.equal(events.find(e => e.stage === 'assessment-status')?.data.reason, 'snapshot-capacity');
    assert.equal(events.find(e => e.stage === 'permission')?.data.wouldDecision, undefined);
    assert.equal(runtime.observationQueue.health().dropped, 1);
  } finally { runtime.shutdown(); await rm(cwd, { recursive: true, force: true }); }
});

test('a pending would-block finding survives a burst beyond the owner history limit', { timeout: 30000 }, async () => {
  let release!: (value: unknown) => void;
  const h = await guardHarness({ judge: request => request.action.callId === 'first'
    ? new Promise(done => { release = done; }) : Promise.resolve(answer(request.policy)) });
  try {
    await h.start(); await h.call('first');
    for (let i = 0; !release && i < 400; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(release, 'first assessment entered the judge');
    for (let i = 0; i < 110; i++) await h.call(`later-${i}`);
    await tick();
    const policy = h.records.find(r => r.stage === 'status')!.policy;
    release(answer(policy, 'FAIL'));
    assert.equal((await h.assessed('first')).status, 'completed');
    await h.commands.get('tenet').handler('', h.ctx);
    assert.ok(h.views.at(-1).items.some((item: string) => item.includes('first') && item.includes('Suspected violation')));
  } finally { release?.(undefined); await h.close(); }
});

test('completed clean observations count as coverage, not concerns', async () => {
  const h = await guardHarness();
  try {
    await h.start(); await h.call('clean'); await h.assessed('clean');
    assert.match(h.statuses.at(-1)!, /1 completed/);
    assert.match(h.statuses.at(-1)!, /0 concerns/);
    await h.commands.get('tenet').handler('', h.ctx);
    assert.deepEqual(h.views.at(-1).items, ['No recent concerns recorded.']);
  } finally { await h.close(); }
});

for (const judgeStartDelay of [0, 25]) test(`enforcement still waits for the evaluator after ${judgeStartDelay}ms judge startup`, async () => {
  let resolve!: (value: unknown) => void;
  let selected!: PolicySet;
  let entered!: () => void;
  const judgeStarted = new Promise<void>(done => { entered = done; });
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async request => {
    if (judgeStartDelay) await new Promise(done => setTimeout(done, judgeStartDelay));
    selected = request.policy; return new Promise(done => { resolve = done; entered(); });
  } });
  try {
    await h.start();
    const pending = h.call();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([judgeStarted, new Promise<never>((_done, reject) => {
        timer = setTimeout(() => reject(new Error('judge did not start within the fixture deadline')), 2000);
      })]);
    } finally { clearTimeout(timer); }
    assert.equal(h.records.some(r => r.stage === 'permission'), false);
    resolve(answer(selected));
    assert.equal(await pending, undefined);
  } finally { await h.close(); }
});
