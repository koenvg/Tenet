import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readArchive, sessionKey } from '../src/recording/archive.js';
import { ArchiveWriter } from './legacy-recording-fixture.js';
import { responseSnapshot } from '../src/recording/contract.js';
import { writeStageFile } from '../src/recording/files.js';
import { invocationView } from '../src/inspector/view.js';
import { startInspector } from '../src/inspector/server.js';
import { createJevJudge } from '../src/decision/jev.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { policy } from './helpers.js';
import { spawnSync } from 'node:child_process';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readPrivateFile } from '../src/recording/files.js';
import { recordFailureFixture } from './failure-fixture.js';

const identity = { sessionId: 'failures', invocationId: 'one', callId: 'one', toolName: 'edit', cwd: '/project', mode: 'observe' as const };
async function temporary(run: (dir: string) => Promise<void>) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'tenet-failures-')));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('persisted provider failures and absent submissions remain distinct after reader restart', () => temporary(async dir => {
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  for (const kind of ['credentials', 'provider', 'invalid']) {
    const sink = writer.bind({ ...identity, invocationId: kind, callId: kind });
    sink('begin', {});
    const result = await decide({ policy, cwd: '/project',
      action: captureAction({ sessionId: identity.sessionId, callId: kind, toolName: 'edit', arguments: {} }),
      judge: createJevJudge({ apiKey: kind === 'credentials' ? '' : 'private-api-key', fetch: async () => kind === 'provider'
        ? new Response('private-error-body', { status: 503, headers: { 'x-secret': 'private-header' } })
        : Response.json({ model: 'bad', answers: {}, text: '<script>untrusted</script>' }) }), recording: sink });
    sink('decision', { decision: result.decision, reason: result.reason });
  }
  await writer.close();
  const { records } = await readArchive(dir);
  for (const kind of ['credentials', 'provider', 'invalid']) {
    const view = invocationView(records.filter(r => r.invocationId === kind));
    assert.equal(view.failure, kind === 'credentials' ? 'missing-credentials' : kind === 'provider' ? 'provider-error' : 'invalid-response');
    assert.equal(view.requestStatus, kind === 'credentials' ? 'not submitted' : 'submitted application payload');
    assert.equal(view.execution, 'unknown');
    assert.equal(view.validation.valid, false);
    if (kind === 'invalid') assert.ok(JSON.stringify(view.response).includes('untrusted'));
  }
  for (const secret of ['private-api-key', 'private-error-body', 'private-header']) assert.ok(!JSON.stringify(records).includes(secret));
  const app = await startInspector({ directory: dir });
  try {
    const detail: any = await (await fetch(`${app.origin}/api/sessions/${sessionKey(identity.sessionId)}/invocations/${sessionKey('credentials')}`)).json();
    assert.equal(detail.view.failure, 'missing-credentials');
    assert.equal(detail.view.requestStatus, 'not submitted');
  } finally { await app.close(); }
}));

test('temporary, corrupt and unsupported records are separate issues beside browsable incomplete calls', () => temporary(async dir => {
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  writer.bind(identity)('begin', {});
  await writer.close();
  const original = (await readArchive(dir)).records[0]!;
  const folder = join(dir, sessionKey(identity.sessionId));
  await writeFile(join(folder, 'partial.tmp'), '{', { mode: 0o600 });
  await writeFile(join(folder, 'corrupt.json'), '{', { mode: 0o600 });
  await writeFile(join(folder, 'unsupported.json'), JSON.stringify({ ...original, schemaVersion: 999 }), { mode: 0o600 });
  const archive = await readArchive(dir);
  assert.equal(archive.records.length, 1);
  assert.deepEqual(archive.issues.map(i => i.reason).sort(), ['corrupt-record', 'temporary-record', 'unsupported-schema']);
  const view = invocationView(archive.records);
  assert.equal(view.assessmentStatus, 'incomplete');
  assert.equal(view.failure, null);
  assert.equal(view.decision, 'unavailable');
  assert.equal(view.execution, 'unknown');
  assert.ok(view.missing.includes('response'));
  assert.equal(view.requestStatus, 'payload unavailable; capture incomplete');
  const app = await startInspector({ directory: dir });
  try {
    const sessions: any = await (await fetch(`${app.origin}/api/sessions`)).json();
    assert.equal(sessions.sessions.length, 1); assert.equal(sessions.issues.length, 3);
    const timeline: any = await (await fetch(`${app.origin}/api/sessions/${sessionKey(identity.sessionId)}`)).json();
    assert.equal(timeline.invocations[0].assessmentStatus, 'incomplete');
  } finally { await app.close(); }
}));

test('response snapshots never invoke arbitrary serialization or retain error objects', () => {
  let called = false;
  assert.equal(responseSnapshot({ toJSON() { called = true; return { credential: 'private' }; } }).unavailable, true);
  assert.equal(called, false);
  assert.equal(responseSnapshot(Object.assign(new Error('private-error'), { headers: { authorization: 'private' } })).unavailable, true);
  assert.equal(responseSnapshot(undefined).unavailable, true);
  const cyclic: any = {}; cyclic.self = cyclic;
  assert.equal(responseSnapshot(cyclic).unavailable, true);
  assert.equal(responseSnapshot('x'.repeat(1024 * 1024)).truncated, true);
  const filtered = responseSnapshot({ model: 'bad', headers: { arbitrary: 'private-header' }, api_key: 'private-key', answers: {} });
  assert.equal(filtered.omittedFields, 2); assert.equal(filtered.untrusted, true);
  assert.ok(!JSON.stringify(filtered).includes('private-'));
  const accessor = { get value() { called = true; return 'private'; } };
  assert.equal(responseSnapshot(accessor).unavailable, true); assert.equal(called, false);
});

test('overflow and serialization losses persist writer-wide health after restart', () => temporary(async dir => {
  const writer = new ArchiveWriter({ enabled: true, directory: dir }, { events: 1, bytes: 10000 });
  const sink = writer.bind(identity);
  sink('begin', {}); sink('decision', { decision: 'ALLOW' });
  const cyclic: any = {}; cyclic.self = cyclic; sink('response', cyclic);
  await writer.close();
  const archive = await readArchive(dir);
  const health = archive.records.find(r => r.stage === 'health')?.data;
  assert.equal(health?.scope, 'writer');
  assert.equal(health?.dropped, 1); assert.equal(health?.failed, 1);
  assert.equal(health?.drainTimeouts, 0);
  assert.equal(invocationView(archive.records).captureHealth.length, 1);
  assert.equal(invocationView(archive.records).decision, 'unavailable');
}));

test('injected disk failure recovers with durable health and no raw error', () => temporary(async dir => {
  let calls = 0;
  const writer = new ArchiveWriter({ enabled: true, directory: dir }, undefined, undefined, async (...args) => {
    if (++calls <= 2) throw Object.assign(new Error('private-disk-details'), { code: 'ENOSPC' });
    return writeStageFile(...args);
  });
  writer.bind(identity)('begin', {});
  await writer.drain();
  assert.equal(writer.health().failed, 2);
  writer.bind(identity)('permission', { outcome: 'released' });
  await writer.close();
  const archive = await readArchive(dir);
  assert.equal(archive.records.find(r => r.stage === 'health')?.data.failed, 2);
  assert.equal(archive.records.find(r => r.stage === 'permission')?.data.outcome, 'released');
  assert.ok(!JSON.stringify(archive).includes('private-disk-details'));
}));

test('bounded shutdown reports pending writes and persists timeout health if storage resumes', () => temporary(async dir => {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  let changes = 0;
  const writer = new ArchiveWriter({ enabled: true, directory: dir }, undefined, () => { changes++; }, async (...args) => {
    started(); await held; return writeStageFile(...args);
  });
  const sink = writer.bind(identity);
  sink('begin', {}); await ready;
  assert.equal(await writer.close(5), false);
  assert.equal(writer.health().pending, 1); assert.equal(writer.health().drainTimeouts, 1);
  assert.ok(changes > 0);
  sink('decision', { decision: 'ALLOW' }); // Closed writers cannot accept new stages.
  release(); assert.equal(await writer.drain(), true);
  const archive = await readArchive(dir);
  assert.equal(archive.records.find(r => r.stage === 'health')?.data.drainTimeouts, 1);
  assert.equal(invocationView(archive.records).decision, 'unavailable');
}));

test('process exit after submission preserves incomplete API state and exposes a partial file', () => temporary(async dir => {
  const child = spawnSync('bun', ['-e', `
    import {sessionKey} from './src/recording/archive.ts';
    import {ArchiveWriter} from './test/legacy-recording-fixture.ts';
    import {createJevJudge} from './src/decision/jev.ts';
    import {decide} from './src/decision/decide.ts';
    import {captureAction} from './src/decision/evidence.ts';
    import {policy} from './test/helpers.ts';
    import {writeFile} from 'node:fs/promises';
    import {join} from 'node:path';
    const writer = new ArchiveWriter({enabled:true,directory:process.argv[1]});
    const sink = writer.bind({sessionId:'interrupted',invocationId:'call',callId:'call',toolName:'edit',cwd:'/project',mode:'observe'});
    sink('begin',{});
    await decide({policy,cwd:'/project',recording:sink,
      action:captureAction({sessionId:'interrupted',callId:'call',toolName:'edit',arguments:{}}),
      judge:createJevJudge({apiKey:'offline',fetch:async()=>{
        await writer.drain();
        await writeFile(join(process.argv[1],sessionKey('interrupted'),'response.tmp'),'{', {mode:0o600});
        process.exit(23);
      }})});
  `, dir], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 23, child.stderr);
  const app = await startInspector({ directory: dir });
  try {
    const detail: any = await (await fetch(`${app.origin}/api/sessions/${sessionKey('interrupted')}/invocations/${sessionKey('call')}`)).json();
    assert.equal(detail.view.requestStatus, 'submitted application payload');
    assert.equal(detail.view.assessmentStatus, 'incomplete');
    assert.equal(detail.view.response, null);
    assert.equal(detail.view.decision, 'unavailable');
    assert.equal(detail.view.execution, 'unknown');
    assert.deepEqual(detail.issues.map((i: any) => i.reason), ['temporary-record']);
  } finally { await app.close(); }
}));

test('capture degradation remains owner-only during live and recovered evaluator history', () => temporary(async dir => {
  const bad = join(dir, 'not-directory'); await writeFile(bad, '');
  for (const mode of ['observe', 'enforce']) {
    const histories: unknown[] = [];
    const h = await guardHarness({ env: { TENET_MODE: mode, TENET_RECORDING: 'on', TENET_RECORDING_DIR: join(bad, 'archive') },
      judge: async request => { histories.push(request.trajectory); return answer(request.policy); } });
    try {
      await h.start(); await h.call('first'); await h.emit('session_shutdown');
      assert.ok(h.statuses.some(s => /[1-9]\d* lost/.test(s)));
      await h.start(); await h.call('resumed'); await h.emit('session_shutdown');
      assert.equal(histories.length, 2);
      const context = JSON.stringify({ branch: h.branch, histories });
      for (const marker of ['TENET capture', 'TENET recording', 'drainTimeouts', bad]) assert.ok(!context.includes(marker), marker);
      assert.ok(!h.records.some(r => ['health', 'request', 'response', 'validation'].includes(r.stage)));
    } finally { await h.close(); }
  }
}));

test('recorded deadline remains timeout when transport cancellation follows it', () => temporary(async dir => {
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  const sink = writer.bind(identity);
  let finish!: () => void;
  const validated = new Promise<void>(resolve => { finish = resolve; });
  sink('begin', {});
  const result = await decide({ policy, cwd: '/project', config: { deadlineMs: 20 },
    recording: (stage, data) => { sink(stage, data); if (stage === 'validation') finish(); },
    action: captureAction({ sessionId: identity.sessionId, callId: 'one', toolName: 'edit', arguments: {} }),
    judge: createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('private-abort')), { once: true });
    }) }) });
  sink('decision', { decision: result.decision, reason: result.reason });
  await validated;
  await writer.close();
  assert.equal(result.reason, 'timeout');
  const view = invocationView((await readArchive(dir)).records);
  assert.equal(view.failure, 'timeout');
  assert.equal(view.requestStatus, 'submitted application payload');
  assert.equal(view.response, null);
}));

test('submission markers survive a missing payload without fabricating evidence', () => temporary(async dir => {
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  writer.bind(identity)('validation', { valid: false, reason: 'provider-error', request: 'submitted' });
  await writer.close();
  const view = invocationView((await readArchive(dir)).records);
  assert.equal(view.requestStatus, 'submitted; payload unavailable');
  assert.equal(view.evidence, null); assert.equal(view.failure, 'provider-error');
  assert.ok(view.missing.includes('request'));
}));

test('metadata index retains failure summaries and health without rereading response payloads', () => temporary(async dir => {
  await recordFailureFixture(dir);
  let reads = 0;
  const index = new ArchiveIndex(dir, async (...args) => { reads++; return readPrivateFile(...args); });
  await index.refresh();
  const initialReads = reads;
  const session = sessionKey('failure-history');
  const timeline = index.invocations(session).items;
  assert.equal(timeline.find(i => i.callId === 'provider-error')?.failure, 'provider-error');
  assert.equal(timeline.find(i => i.callId === 'interrupted')?.assessmentStatus, 'incomplete');
  assert.equal(index.captureHealth(session)[0]?.dropped, 1);
  assert.deepEqual(index.issues(session).map(i => i.reason).sort(), ['corrupt-record', 'temporary-record', 'unsupported-schema']);
  await index.refresh();
  index.invocations(session); index.captureHealth(session);
  assert.equal(reads, initialReads, 'warm metadata queries do not reread evidence');
  for (const item of timeline) {
    const detail = invocationView((await index.detail(session, item.id)).records);
    assert.equal(item.failure, detail.failure);
    assert.equal(item.assessmentStatus, detail.assessmentStatus);
  }
}));
