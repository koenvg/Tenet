import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGuard, type GuardOptions, type GuardSession } from '../dist/sdk/index.js';
import { answer, policy, sdkAnswers } from './helpers.js';

async function fixture() {
  const root = await realpath(await mkdtemp('/tmp/sdk-projects-'));
  const projects = [join(root, 'a'), join(root, 'b')];
  for (const cwd of projects) {
    await mkdir(join(cwd, '.tenet'), { recursive: true, mode: 0o700 });
    await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
  }
  const settings = async (cwd: string, value: unknown) => writeFile(join(cwd, '.tenet/config.json'), JSON.stringify(value), { mode: 0o600 });
  const guards: ReturnType<typeof createGuard>[] = [];
  const guard = (options: Partial<GuardOptions> = {}) => {
    const value = createGuard({ host: 'sdk-projects', env: { TENET_RECORDING: 'off', TENET_MODE: 'enforce' },
      controlPath: join(root, 'control/state.json'), ...options });
    guards.push(value); return value;
  };
  return { root, a: projects[0]!, b: projects[1]!, settings, guard,
    close: async () => { for (const g of guards) await g.close(); await rm(root, { recursive: true, force: true }); } };
}
const local = (model: string) => ({ protocol: 'system-one', baseUrl: 'http://127.0.0.1:18091', model, auth: { type: 'none' } });
const invoke = (session: GuardSession, sessionId: string, callId: string) => {
  const call = { callId, toolName: 'opaque', input: {} };
  return session.beforeTool({ ...call, current: () => ({ sessionId, contextId: 'main', ...call }) });
};

test('compiled SDK caches separate canonical project snapshots and reports no selection before initialization', async () => {
  const h = await fixture();
  try {
    await h.settings(h.a, { version: 2, judge: local('a-original'), decision: { deadlineMs: 100 }, observation: { running: 1 } });
    await h.settings(h.b, { version: 2, judge: local('b-original'), decision: { deadlineMs: 200 }, observation: { running: 2 } });
    const guard = h.guard();
    assert.deepEqual(guard.status().projects, []);
    const a = guard.openSession({ sessionId: 'a', contextId: 'main' }, h.a);
    const b = guard.openSession({ sessionId: 'b', contextId: 'main' }, h.b);
    assert.equal((await a.ready).judge.requestedModel, 'a-original');
    assert.equal((await b.ready).judge.requestedModel, 'b-original');
    assert.deepEqual(guard.status().projects.map(p => [p.directory, p.judge.requestedModel, p.configuration.deadlineMs, p.observations.limits.running]),
      [[h.a, 'a-original', 100, 1], [h.b, 'b-original', 200, 2]]);
    await h.settings(h.a, { version: 2, judge: local('a-edited') });
    await a.close();
    const alias = join(h.root, 'alias'); await symlink(h.a, alias);
    const later = guard.openSession({ sessionId: 'later', contextId: 'main' }, alias);
    assert.equal((await later.ready).judge.requestedModel, 'a-original');
    assert.equal(guard.status().projects.length, 2);
    const fresh = h.guard().openSession({ sessionId: 'fresh', contextId: 'main' }, h.a);
    assert.equal((await fresh.ready).judge.requestedModel, 'a-edited');
  } finally { await h.close(); }
});

test('compiled SDK routes distinct credentials, failures, owner reports and records to each project', async () => {
  const h = await fixture(); const priorFetch = globalThis.fetch;
  const calls: { url: string; authorization: string | null; model: string }[] = [];
  const records: { sessionId: string; stage: string; data: Record<string, unknown> }[] = [];
  const reports: { sessionId: string; model: string | null | undefined }[] = [];
  try {
    const hosted = (baseUrl: string, model: string, name: string) => ({ protocol: 'system-one', baseUrl, model, auth: { type: 'bearer-env', name } });
    await h.settings(h.a, { version: 2, judge: hosted('https://a.example', 'a-model', 'A_KEY'), decision: { deadlineMs: 100 } });
    await h.settings(h.b, { version: 2, judge: hosted('https://b.example', 'b-model', 'B_KEY'), decision: { deadlineMs: 500 } });
    globalThis.fetch = (async (url, init) => {
      const body = JSON.parse(init!.body as string);
      calls.push({ url: String(url), authorization: new Headers(init!.headers).get('authorization'), model: body.model });
      if (String(url).startsWith('https://a.example')) return new Response('private-error-body', { status: 503 });
      return Response.json({ model: 'scripted-returned', answers: sdkAnswers(answer(policy), 1, body.questions) });
    }) as typeof fetch;
    const env = { TENET_MODE: 'enforce', TENET_RECORDING: 'off', A_KEY: 'a-secret', B_KEY: 'b-secret', TYPESAFE_API_KEY: 'ambient-secret' };
    const guard = h.guard({ env,
      bindRecording: identity => (stage, data) => { records.push({ sessionId: identity.sessionId, stage, data }); },
      onOwnerEvent: event => { if ((event.type === 'permission' || event.type === 'assessment') && event.report)
        reports.push({ sessionId: event.identity.sessionId, model: event.report.requestedModel }); } });
    const a = guard.openSession({ sessionId: 'a', contextId: 'main' }, h.a); await a.ready;
    env.B_KEY = 'changed-after-construction';
    const b = guard.openSession({ sessionId: 'b', contextId: 'main' }, h.b); await b.ready;
    assert.equal((await invoke(a, 'a', 'failed')).reason, 'provider-error');
    assert.equal((await invoke(b, 'b', 'good')).assessment.status, 'completed');
    assert.deepEqual(calls.map(c => [c.url, c.authorization, c.model]), [
      ['https://a.example/v1/systemone', 'Bearer a-secret', 'a-model'],
      ...Array.from({ length: 3 }, () => ['https://b.example/v1/systemone', 'Bearer b-secret', 'b-model']),
    ]);
    assert.ok(reports.some(r => r.sessionId === 'a' && r.model === 'a-model'));
    assert.ok(reports.some(r => r.sessionId === 'b' && r.model === 'b-model'));
    for (const id of ['a', 'b']) {
      const assessment = records.find(r => r.sessionId === id && r.stage === 'assessment')!;
      assert.equal(assessment.data.requestedModel, `${id}-model`);
    }
    assert.doesNotMatch(JSON.stringify([records, reports, guard.status()]), /a-secret|b-secret|ambient-secret|changed-after-construction|private-error-body|A_KEY|B_KEY/);
  } finally { globalThis.fetch = priorFetch; await h.close(); }
});

test('compiled SDK retains invalid snapshots and frozen owner inputs while new guards see repairs', async () => {
  const h = await fixture(); const priorHome = process.env.HOME;
  try {
    process.env.HOME = h.root;
    await mkdir(join(h.root, '.tenet'), { mode: 0o700 });
    const owner = join(h.root, '.tenet/config.json');
    await writeFile(owner, JSON.stringify({ version: 2, judge: local('owner-original'), decision: { deadlineMs: 120 }, observation: { running: 1 } }), { mode: 0o600 });
    await h.settings(h.a, { version: 1 });
    const guard = h.guard();
    const a = guard.openSession({ sessionId: 'bad', contextId: 'main' }, h.a);
    assert.equal((await a.ready).reason, 'configuration');
    await h.settings(h.a, { version: 2, judge: local('repaired') });
    await writeFile(owner, JSON.stringify({ version: 2, judge: local('owner-edited'), decision: { deadlineMs: 200 } }));
    const b = guard.openSession({ sessionId: 'b', contextId: 'main' }, h.b);
    assert.equal((await b.ready).judge.requestedModel, 'owner-original');
    assert.equal(b.status().configuration.deadlineMs, 120);
    await a.close();
    const later = guard.openSession({ sessionId: 'later', contextId: 'main' }, h.a);
    assert.equal((await later.ready).reason, 'configuration');
    assert.equal((await invoke(later, 'later', 'blocked')).permission, 'blocked');
    const fresh = h.guard();
    assert.equal((await fresh.openSession({ sessionId: 'fresh-a', contextId: 'main' }, h.a).ready).judge.requestedModel, 'repaired');
    assert.equal((await fresh.openSession({ sessionId: 'fresh-b', contextId: 'main' }, h.b).ready).judge.requestedModel, 'owner-edited');
  } finally { if (priorHome === undefined) delete process.env.HOME; else process.env.HOME = priorHome; await h.close(); }
});

async function until(predicate: () => boolean) {
  for (let n = 0; n < 200 && !predicate(); n++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(predicate(), true);
}

test('compiled SDK owns one injected factory, isolated queues and session-scoped cancellation', async () => {
  const h = await fixture(); const priorFetch = globalThis.fetch;
  const signals = new Map<string, AbortSignal>(); let created = 0; let network = 0;
  try {
    await h.settings(h.a, { version: 2, judge: local('a'), observation: { running: 1, waiting: 1 }, decision: { deadlineMs: 5000 } });
    await h.settings(h.b, { version: 2, judge: local('b'), observation: { running: 2, waiting: 2 }, decision: { deadlineMs: 4000 } });
    globalThis.fetch = (() => { network++; throw new Error('network-trap'); }) as typeof fetch;
    const guard = h.guard({ env: { TENET_RECORDING: 'off' }, createJudge: () => {
      created++; return async (request, signal) => { signals.set(request.action.callId, signal!); return new Promise(() => {}); };
    } });
    const a1 = guard.openSession({ sessionId: 'a1', contextId: 'main' }, h.a);
    const a2 = guard.openSession({ sessionId: 'a2', contextId: 'main' }, h.a);
    const b = guard.openSession({ sessionId: 'b', contextId: 'main' }, h.b);
    await Promise.all([a1.ready, a2.ready, b.ready]); assert.equal(created, 0);
    await invoke(a1, 'a1', 'a-running'); await invoke(a2, 'a2', 'a-waiting');
    assert.equal((await invoke(a2, 'a2', 'a-dropped')).assessment.status, 'dropped');
    await invoke(b, 'b', 'b-running'); await invoke(b, 'b', 'b-second');
    await until(() => signals.size === 3);
    assert.equal(created, 1); assert.equal(network, 0);
    await h.settings(h.a, { version: 2, judge: local('edited'), observation: { running: 3 }, decision: { deadlineMs: 10 } });
    const later = guard.openSession({ sessionId: 'later', contextId: 'main' }, h.a);
    assert.equal((await later.ready).configuration.deadlineMs, 5000);
    assert.equal(later.status().configuration.observation!.running, 1);
    assert.deepEqual(guard.status().projects.map(p => [p.observations.running, p.observations.waiting]), [[1, 1], [2, 0]]);
    await a1.close(); await until(() => signals.has('a-waiting'));
    assert.equal(signals.get('a-running')!.aborted, true);
    assert.equal(signals.get('a-waiting')!.aborted, false);
    assert.equal(signals.get('b-running')!.aborted, false);
    await guard.close();
    for (const signal of signals.values()) assert.equal(signal.aborted, true);
    assert.deepEqual(guard.status().projects.map(p => [p.observations.running, p.observations.waiting, p.observations.retainedBytes]), [[0, 0, 0], [0, 0, 0]]);
    assert.equal(network, 0);
  } finally { globalThis.fetch = priorFetch; await h.close(); }
});

test('compiled SDK enforces each project deadline without cancelling another project', async () => {
  const h = await fixture(); const signals = new Map<string, AbortSignal>();
  try {
    await h.settings(h.a, { version: 2, decision: { deadlineMs: 40 } });
    await h.settings(h.b, { version: 2, decision: { deadlineMs: 2000 } });
    const guard = h.guard({ judge: async (request, signal) => { signals.set(request.action.callId, signal!); return new Promise(() => {}); } });
    const a = guard.openSession({ sessionId: 'a', contextId: 'main' }, h.a);
    const b = guard.openSession({ sessionId: 'b', contextId: 'main' }, h.b);
    await Promise.all([a.ready, b.ready]);
    const short = invoke(a, 'a', 'short'); const long = invoke(b, 'b', 'long');
    const result = await short;
    assert.equal(result.permission, 'blocked'); assert.equal(result.reason, 'timeout');
    assert.equal(signals.get('short')!.aborted, true); assert.equal(signals.get('long')!.aborted, false);
    await b.close(); assert.equal((await long).permission, 'blocked');
    assert.equal(signals.get('long')!.aborted, true);
  } finally { await h.close(); }
});

test('compiled SDK rejects missing and nondirectory project paths without initializing resources', async () => {
  const h = await fixture();
  try {
    const guard = h.guard();
    for (const cwd of [join(h.root, 'missing'), join(h.a, 'TENET.md')])
      assert.throws(() => guard.openSession({ sessionId: 'bad', contextId: 'main' }, cwd), /invalid-project-directory/);
    assert.deepEqual(guard.status().projects, []); assert.equal(guard.status().sessions, 0);
  } finally { await h.close(); }
});
