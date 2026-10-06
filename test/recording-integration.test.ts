import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardHarness } from './guard-harness.js';
import { answer, sdkAnswers } from './helpers.js';
import { readArchive, qualifiedSessionKey } from '../src/recording/archive.js';
import { ArchiveWriter } from '../src/recording/archive.js';
import { responseSnapshot } from '../src/recording/contract.js';
import { recordFixture } from './recording-fixture.js';
import { createJevJudge } from '../src/decision/jev.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { policy } from './helpers.js';
import { spawnSync } from 'node:child_process';

async function temp(run: (dir: string) => Promise<void>) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'tenet-capture-')));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('capture on/off/disk-failing leaves both modes, approvals, permission and execution unchanged', { timeout: 30000 }, () => temp(async dir => {
  await writeFile(join(dir, 'not-directory'), '');
  for (const mode of ['observe', 'enforce']) for (const outcome of ['PASS', 'FAIL', 'APPROVAL_REQUIRED'] as const) {
    const results: unknown[] = [];
    for (const variant of ['off', 'on', 'failing']) {
      const h = await guardHarness({ env: { TENET_MODE: mode, TENET_RECORDING: variant === 'off' ? 'off' : 'on',
        TENET_RECORDING_DIR: variant === 'failing' ? join(dir, 'not-directory', 'archive') : join(dir, `${mode}-${outcome}`) },
        judge: async request => answer(request.policy, outcome) });
      try {
        await h.start(); const veto = await h.call();
        if (mode === 'observe') await h.assessed();
        let executed = 0;
        if (!veto?.block) { executed++; await h.emit('tool_result', { toolCallId: 'c', toolName: 'edit', content: [], isError: false }); }
        await h.emit('session_shutdown');
        results.push({ blocked: !!veto?.block, executed, prompts: h.prompts.length,
          decision: h.records.find(r => r.stage === 'decision')?.decision,
          permission: h.records.find(r => r.stage === 'permission')?.outcome,
          approval: h.records.find(r => r.stage === 'approval')?.outcome });
        assert.ok(!JSON.stringify(h.records).includes('TENET capture'));
        if (variant === 'failing') assert.ok(h.statuses.some(s => /[1-9]\d* lost/.test(s)));
      } finally { await h.close(); }
    }
    assert.deepEqual(results[1], results[0]); assert.deepEqual(results[2], results[0]);
  }
}));

test('records real passing and concerning requests before a fresh reader opens; resumed and forked identities stay separate', { timeout: 30000 }, () => temp(async dir => {
  const fixture = await recordFixture(dir);
  const policy = fixture.records.find(record => record.stage === 'begin')!.data.policy;
  assert.equal(fixture.records.filter(r => r.stage === 'decision').length, 2);
  const child = spawnSync('bun', ['-e', `
    import {startInspector} from './src/inspector/server.ts';
    const app = await startInspector({directory: process.argv[1]});
    const response = await fetch(app.origin + '/api/sessions');
    const data = await response.json();
    console.log(JSON.stringify(data.sessions.map(s => ({sessionId:s.sessionId, invocations:s.invocations}))));
    await app.close();
  `, dir], { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' }, timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), [{ sessionId: 's', invocations: 2 }]);
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  const identity = { host: 'pi', contextId: 'main', sessionId: 's', invocationId: 'resumed', callId: 'new', toolName: 'edit', cwd: '/project', mode: 'observe' as const };
  writer.bind(identity)('begin', { policy });
  writer.bind({ ...identity, sessionId: 'fork' })('begin', { policy });
  await writer.close();
  const reopened = await readArchive(dir);
  assert.equal(reopened.records.length, fixture.records.length + 2);
  assert.equal(new Set(reopened.records.map(r => r.sessionId)).size, 2);
  const folder = join(dir, qualifiedSessionKey('pi', 's', 'main'));
  const valid = JSON.parse(await readFile(join(folder, (await readdir(folder))[0]!), 'utf8'));
  await writeFile(join(folder, 'unsupported.json'), JSON.stringify({ ...valid, schemaVersion: 500 }), { mode: 0o600 });
  await writeFile(join(folder, 'pending.tmp'), '{', { mode: 0o600 });
  const corrupt = await readArchive(dir);
  assert.equal(corrupt.records.length, reopened.records.length);
  assert.deepEqual(corrupt.issues.map(i => i.reason).sort(), ['temporary-record', 'unsupported-schema']);
}));

test('early guard unavailability records no fabricated request and default capture is independent of enforcement configuration', () => temp(async dir => {
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: dir, TENET_EFFECT_THRESHOLD: 'invalid' } });
  try {
    await h.start(); await h.call(); await h.emit('session_shutdown');
    const { records } = await readArchive(dir);
    assert.ok(!records.some(r => r.stage === 'request'));
    assert.equal(records.find(r => r.stage === 'permission')?.data.requestStatus, 'not-submitted');
    assert.equal(records.find(r => r.stage === 'permission')?.data.reason, 'configuration');
    assert.ok(!records.some(r => r.stage === 'decision'));
  } finally { await h.close(); }
}));

test('SDK failures record bounded untrusted responses and safe categories, never raw error bodies', async () => {
  const base = { policy, cwd: '/project', action: captureAction({ sessionId: 's', callId: 'c', toolName: 'edit', arguments: {} }) };
  for (const kind of ['invalid', 'provider', 'credentials']) {
    const events: any[] = [];
    const judge = createJevJudge({ apiKey: kind === 'credentials' ? '' : 'transport-secret', fetch: async () => kind === 'provider'
      ? new Response('transport-private-body', { status: 500 }) : Response.json({ model: 'bad', answers: {}, text: 'untrusted-response' }) });
    const result = await decide({ ...base, judge, recording: (stage, data) => events.push({ stage, data }) });
    assert.equal(result.reason, kind === 'invalid' ? 'invalid-response' : kind === 'provider' ? 'provider-error' : 'missing-credentials');
    assert.ok(events.some(e => e.stage === 'validation' && e.data.valid === false));
    if (kind === 'invalid') assert.ok(events.some(e => e.stage === 'response'));
    if (kind === 'credentials') assert.ok(!events.some(e => e.stage === 'request'));
    assert.ok(!JSON.stringify(events).includes('transport-private-body'));
    assert.ok(!JSON.stringify(events).includes('transport-secret'));
  }
  const snapshot = responseSnapshot('x'.repeat(1024 * 1024 + 5));
  assert.equal(snapshot.truncated, true); assert.equal(Buffer.byteLength(snapshot.preview as string), 1024 * 1024);
  assert.ok(Buffer.byteLength(responseSnapshot('€'.repeat(400000)).preview as string) <= 1024 * 1024);
});

test('timeout capture remains partial and cannot release an enforcement decision', async () => {
  const events: { stage: string; data: Record<string, unknown> }[] = [];
  const judge = createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('private-transport-error')), { once: true });
  }) });
  const result = await decide({ policy, cwd: '/project', config: { deadlineMs: 20 }, judge,
    action: captureAction({ sessionId: 's', callId: 'c', toolName: 'edit', arguments: {} }),
    recording: (stage, data) => events.push({ stage, data }) });
  assert.equal(result.reason, 'timeout'); assert.equal(result.decision, 'BLOCK');
  assert.ok(events.some(e => e.stage === 'request'));
  assert.ok(!events.some(e => e.stage === 'response'));
  assert.ok(!JSON.stringify(events).includes('private-transport-error'));
});

test('concurrent SDK completions stay bound to their invocation IDs across a session switch', () => temp(async dir => {
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: dir },
    createJudge: () => createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => {
      const payload = JSON.parse(init!.body as string);
      if (payload.state.action.callId === 'old') { started(); await held; }
      const result = answer(payload.state.policy);
      return Response.json({ model: 'offline', answers: sdkAnswers(result) });
    } }) });
  try {
    await h.start(); const old = h.call('old'); await ready;
    await h.call('parallel');
    await h.assessed('parallel');
    await h.emit('session_before_switch');
    h.ctx.sessionManager.getSessionId = () => 'new-session';
    await h.start(); await h.call('new');
    await h.assessed('new');
    release(); await old; await h.emit('session_shutdown');
    const { records } = await readArchive(dir);
    const requests = records.filter(r => r.stage === 'request');
    assert.equal(requests.length, 3);
    assert.equal(new Set(requests.map(r => r.invocationId)).size, 3);
    for (const request of requests) {
      assert.equal((request.data.payload as any).state.action.callId, request.callId);
      assert.equal(request.sessionId, request.callId === 'new' ? 'new-session' : 's');
      assert.ok(records.filter(r => r.invocationId === request.invocationId).every(r => r.sessionId === request.sessionId && r.callId === request.callId));
    }
  } finally { release?.(); await h.close(); }
}));
test('reused host call IDs across a session switch cannot attribute a late result to the new invocation', () => temp(async dir => {
  const trajectories: string[] = [];
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: dir },
    judge: async request => { trajectories.push(JSON.stringify(request.trajectory)); return answer(request.policy); } });
  try {
    await h.start(); await h.call('reused');
    await h.emit('session_before_switch');
    h.ctx.sessionManager.getSessionId = () => 'resumed-or-forked';
    await h.start(); await h.call('reused');
    await h.emit('tool_result', { toolCallId: 'reused', toolName: 'edit', content: [{ type: 'text', text: 'late-old-session-evidence' }], isError: false });
    await h.call('next');
    await h.assessed('next');
    assert.ok(!trajectories.at(-1)!.includes('late-old-session-evidence'));
    await h.emit('session_shutdown');
    const { records } = await readArchive(dir);
    const calls = records.filter(r => r.stage === 'begin' && r.callId === 'reused');
    assert.equal(calls.length, 2); assert.notEqual(calls[0]!.invocationId, calls[1]!.invocationId);
    assert.ok(records.filter(r => r.stage === 'execution').every(r => r.data.outcome === 'unknown'));
    assert.deepEqual(new Set(calls.map(r => r.sessionId)), new Set(['s', 'resumed-or-forked']));
  } finally { await h.close(); }
}));


test('recording-specific owner UI failures cannot veto or change approval in either mode', () => temp(async dir => {
  for (const mode of ['observe', 'enforce']) for (const outcome of ['PASS', 'APPROVAL_REQUIRED'] as const) {
    const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: dir, TENET_MODE: mode },
      judge: async request => answer(request.policy, outcome) });
    const notify = h.ctx.ui.notify, status = h.ctx.ui.setStatus;
    let approvals = 0;
    h.ctx.ui.notify = value => { if (value.startsWith('TENET recording')) throw new Error('capture-ui'); return notify(value); };
    h.ctx.ui.setStatus = (key, value) => { if (key === 'tenet-recording') throw new Error('capture-ui'); return status(key, value); };
    h.ctx.ui.confirm = async () => { approvals++; return true; };
    try {
      await h.start(); assert.equal(await h.call(), undefined); await h.emit('session_shutdown');
      assert.equal(h.records.find(r => r.stage === 'permission')?.outcome, 'released');
      assert.equal(approvals, mode === 'enforce' && outcome === 'APPROVAL_REQUIRED' ? 1 : 0);
    } finally { await h.close(); }
  }
}));
