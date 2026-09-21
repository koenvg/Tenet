import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, stat, symlink, writeFile, rm, realpath, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveWriter, readArchive, recordingConfig, sessionKey } from '../src/recording/archive.js';
import { createJevJudge } from '../src/decision/jev.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { answer, policy } from './helpers.js';

const identity = { sessionId: '../session', invocationId: 'invocation', callId: 'call', toolName: 'edit', cwd: '/project', mode: 'observe' as const };
async function temporary(run: (dir: string) => Promise<void>) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'tenet-archive-')));
  try { await run(join(dir, 'recordings')); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('archive persists immutable private records across writers and reader restarts', () => temporary(async dir => {
  const first = new ArchiveWriter({ enabled: true, directory: dir });
  const second = new ArchiveWriter({ enabled: true, directory: dir });
  first.bind(identity)('begin', { policy });
  second.bind(identity)('decision', { decision: 'ALLOW' });
  await Promise.all([first.drain(), second.drain()]);
  const archive = await readArchive(dir);
  assert.equal(archive.records.length, 2); assert.deepEqual(archive.issues, []);
  assert.equal(new Set(archive.records.map(r => r.eventId)).size, 2);
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  const folder = join(dir, sessionKey(identity.sessionId));
  for (const file of await readdir(folder)) assert.equal((await stat(join(folder, file))).mode & 0o777, 0o600);
}));

test('config opt-out and invalid path disable only recording; unsafe storage and corrupt records are reported', () => temporary(async dir => {
  assert.equal(recordingConfig({}).enabled, true);
  assert.equal(recordingConfig({ TENET_RECORDING: 'off' }).enabled, false);
  assert.equal(recordingConfig({ TENET_RECORDING_DIR: 'relative' }).enabled, false);
  const disabled = new ArchiveWriter({ enabled: false, directory: dir });
  disabled.bind(identity)('begin', {}); await disabled.drain();
  assert.deepEqual((await readArchive(dir)).records, []);
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  writer.bind(identity)('begin', {}); await writer.drain();
  const folder = join(dir, sessionKey(identity.sessionId));
  await writeFile(join(folder, 'bad.json'), '{', { mode: 0o600 });
  await symlink('/etc/passwd', join(folder, 'escape.json'));
  const read = await readArchive(dir);
  assert.equal(read.records.length, 1); assert.equal(read.issues.length, 2);
  const failing = new ArchiveWriter({ enabled: true, directory: join(dir, 'escape.json', 'child') });
  await symlink('/tmp', join(dir, 'escape.json'));
  failing.bind(identity)('begin', {}); await failing.drain();
  assert.ok(failing.health().failed > 0);
}));

test('SDK submitted payload is captured exactly after redaction, with response and validation but no credential', () => temporary(async dir => {
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  let outbound: any;
  const assessment = answer(policy);
  const answers = Object.fromEntries(assessment.rules.flatMap((r, i) => [
    [`rule_${i}_outcome`, { type: 'choice', ...r.outcome, confidence: 1 }],
    [`rule_${i}_evidence`, { type: 'choice', ...r.evidence, confidence: 1 }],
  ]));
  const judge = createJevJudge({ apiKey: 'transport-secret', fetch: async (_url, init) => {
    outbound = JSON.parse(init!.body as string);
    return Response.json({ model: 'scripted', answers });
  } });
  const result = await decide({ policy, cwd: '/project',
    action: captureAction({ sessionId: identity.sessionId, callId: 'call', toolName: 'edit', arguments: { token: 'hidden', text: '<script>hostile</script>' } }),
    trajectory: { observations: [1, 2, 3].map(timestamp => ({ timestamp, sessionId: identity.sessionId, callId: 'prior', toolName: 'edit', origin: 'pi-tool-result', data: { text: `event-${timestamp}` } })), omitted: 0, limitations: [] },
    evidenceLimits: { recentEvents: 1, maxBytes: 24576 },
    judge, recording: writer.bind(identity) });
  await writer.drain();
  assert.equal(result.decision, 'ALLOW');
  const { records } = await readArchive(dir);
  const captured = records.find(r => r.stage === 'request')!;
  assert.deepEqual(captured.data.payload, outbound);
  assert.equal(outbound.state.trajectory.observations.length, 1);
  assert.equal(outbound.state.trajectory.omitted, 2);
  assert.ok(outbound.state.trajectory.limitations.includes('history-omitted'));
  assert.ok(records.some(r => r.stage === 'response'));
  assert.ok(records.some(r => r.stage === 'validation'));
  const failing = await decide({ policy, cwd: '/project',
    action: captureAction({ sessionId: 's', callId: 'c', toolName: 'edit', arguments: {} }), judge,
    recording: () => { throw new Error('sink-failure'); } });
  assert.equal(failing.decision, 'ALLOW');
  assert.ok(!JSON.stringify(records).includes('transport-secret'));
  assert.ok(!JSON.stringify(records).includes('hidden'));
}));

test('throwing recording sinks cannot change passing or concerning decisions', async () => {
  for (const choice of ['PASS', 'FAIL'] as const) {
    const options = { policy, cwd: '/project', action: captureAction({ sessionId: 's', callId: 'c', toolName: 'edit', arguments: {} }), judge: async () => answer(policy, choice) };
    const normal = await decide(options);
    const failing = await decide({ ...options, recording: () => { throw new Error('disk'); } });
    assert.equal(failing.decision, normal.decision); assert.equal(failing.reason, normal.reason);
  }
});

test('bounded queue and response snapshots report loss without throwing', () => temporary(async dir => {
  const writer = new ArchiveWriter({ enabled: true, directory: dir }, { events: 1, bytes: 10000 });
  const sink = writer.bind(identity);
  sink('begin', {}); sink('decision', { decision: 'ALLOW' });
  await writer.drain();
  assert.equal(writer.health().dropped, 1);
  assert.equal((await readArchive(dir)).records.filter(r => r.stage !== 'health').length, 1);
  const cyclic: any = {}; cyclic.self = cyclic; sink('response', cyclic);
  assert.equal(writer.health().failed, 1);
  await writer.close();
}));

test('reader rejects oversized, malformed-stage and public files independently', () => temporary(async dir => {
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  writer.bind(identity)('begin', {}); await writer.close();
  const original = (await readArchive(dir)).records[0]!;
  const folder = join(dir, sessionKey(identity.sessionId));
  await writeFile(join(folder, 'oversized.json'), 'x'.repeat(4 * 1024 * 1024 + 1), { mode: 0o600 });
  await writeFile(join(folder, 'malformed.json'), JSON.stringify({ ...original, stage: 'request', data: { payload: 'not-a-request' } }), { mode: 0o600 });
  await writeFile(join(folder, 'public.json'), JSON.stringify(original), { mode: 0o644 });
  await chmod(join(folder, 'public.json'), 0o644);
  const read = await readArchive(dir);
  assert.equal(read.records.length, 1); assert.equal(read.issues.length, 3);
}));
