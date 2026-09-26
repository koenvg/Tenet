import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveWriter, parseBbThreadId, readArchive, recordInvocationKey, recordSessionKey } from '../src/recording/archive.js';
import { readPrivateFile } from '../src/recording/files.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';

const thread = 'thr_abcdefgh1234';
const other = 'thr_wxyzabcd1234';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bb-')));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('BB association is optional, validated, and does not change archive keys', () => fixture(async root => {
  assert.equal(parseBbThreadId(thread), thread);
  for (const invalid of ['', 'thr_short', '../other', 'thr_<script>', 'thr_' + 'a'.repeat(65)]) assert.equal(parseBbThreadId(invalid), undefined);
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const identity = { sessionId: 'shared', invocationId: 'one', callId: 'c', toolName: 'edit', cwd: '/tmp', mode: 'observe' as const, host: 'pi', contextId: 'main' };
  writer.bind({ ...identity, bbThreadId: thread })('begin', {});
  writer.bind({ ...identity, invocationId: 'two' })('begin', {});
  assert.throws(() => writer.bind({ ...identity, bbThreadId: 'thr_bad!' }));
  await writer.close();
  const { records, issues } = await readArchive(root);
  assert.deepEqual(issues, []);
  assert.equal(records.length, 2);
  assert.equal(recordSessionKey(records[0]!), recordSessionKey(records[1]!));
  assert.deepEqual(records.map(r => r.bbThreadId).sort(), [thread, undefined].sort());
}));

test('linked selected FAILs exclude unlinked history and invalid assessments', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const record = (sessionId: string, invocationId: string, bbThreadId: string | undefined, choice: string, valid = true) => {
    const sink = writer.bind({ sessionId, invocationId, callId: invocationId, toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId });
    sink('begin', { policy: { rules: [{ id: 'rule-one', text: '<script>inert</script> Never publish', line: 4, enforcement: 'WARN' }] }, integrity: { id: 'integrity', text: 'Keep policy intact' } });
    sink('validation', { valid });
    sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'rule-one', outcome: { choice, probabilities: { FAIL: 0.4 } } }, { ruleId: 'integrity', outcome: { choice: 'PASS' } }] } });
    sink('decision', { decision: 'ALLOW' });
    sink('permission', { outcome: 'released' });
    sink('execution', { outcome: 'unknown' });
  };
  record('shared', 'fail', thread, 'FAIL');
  record('shared', 'pass', thread, 'PASS');
  record('shared', 'legacy', undefined, 'FAIL');
  record('shared', 'fork', other, 'FAIL');
  record('different-session', 'later', thread, 'FAIL');
  record('shared', 'invalid-assessment', thread, 'FAIL', false);
  const bogus = writer.bind({ sessionId: 'shared', invocationId: 'bogus', callId: 'bogus', toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread });
  bogus('begin', { policy: { rules: [{ id: 'real-rule', text: 'Real rule', enforcement: 'BLOCK' }] } });
  bogus('validation', { valid: true });
  bogus('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'not-a-policy-rule', outcome: { choice: 'FAIL' } }] } });
  await writer.close();
  const index = new ArchiveIndex(root); await index.refresh();
  const summary = index.threadStatus(thread);
  assert.equal(summary.coverage, 'partial');
  assert.equal(summary.linkedCalls, 5);
  assert.equal(summary.failures, 2);
  assert.deepEqual(Object.keys(summary).sort(), ['coverage', 'failures', 'issues', 'linkedCalls']);
  const unmonitored = index.threadStatus('thr_000000001234');
  assert.equal(unmonitored.coverage, 'unknown');
  assert.equal(unmonitored.linkedCalls, 0);
  assert.equal(unmonitored.failures, 0);
}));

test('thread coverage reports a missing response stage', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const sink = writer.bind({ sessionId: 's', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/tmp',
    mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread });
  sink('begin', { policy: { rules: [{ id: 'r', text: 'Never publish', enforcement: 'BLOCK' }] } });
  sink('request', { payload: { model: 'fixture', state: { action: {}, policy: {}, context: {}, trajectory: {}, integrity: {} }, questions: {} },
    policy: { rules: [{ id: 'r', text: 'Never publish', enforcement: 'BLOCK' }] }, questionVersion: 'v1', mapping: [] });
  sink('validation', { valid: true });
  sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
  sink('decision', { decision: 'BLOCK' }); sink('permission', { outcome: 'blocked' }); sink('execution', { outcome: 'unknown' });
  await writer.close();
  const index = new ArchiveIndex(root); await index.refresh();
  const status = await index.threadStatus(thread);
  assert.equal(status.failures, 1);
  assert.ok(status.issues.includes('missing-stages'));
}));


test('a recent linked FAIL becomes visible as a bounded cold index catches up', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root }, { events: 512, bytes: 16 * 1024 * 1024 });
  for (let n = 0; n < 280; n++) {
    writer.bind({ sessionId: 'busy-session', invocationId: `historical-${n}`, callId: `old-${n}`,
      toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main' })('begin', {});
  }
  assert.equal(await writer.drain(10_000), true);
  await new Promise(resolve => setTimeout(resolve, 20));
  const recent = writer.bind({ sessionId: 'busy-session', invocationId: 'recent', callId: 'new-call',
    toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread });
  recent('begin', { policy: { rules: [{ id: 'r', text: 'Recent rule', enforcement: 'BLOCK' }] } });
  recent('validation', { valid: true });
  recent('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
  assert.equal(await writer.close(10_000), true);
  const index = new ArchiveIndex(root); await index.refresh();
  assert.ok(index.threadStatus(thread).issues.includes('indexing-in-progress'));
  for (let pass = 0; pass < 8 && index.status().indexing; pass++) await index.refresh();
  assert.equal(index.status().indexing, false);
  const status = index.threadStatus(thread);
  assert.equal(status.linkedCalls, 1);
  assert.equal(status.failures, 1);
  assert.deepEqual(Object.keys(status).sort(), ['coverage', 'failures', 'issues', 'linkedCalls']);
}));

test('a sparse linked session is indexed before dense newer sessions consume the read budget', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root }, { events: 512, bytes: 16 * 1024 * 1024 });
  const linked = writer.bind({ sessionId: 'linked-session', invocationId: 'flagged', callId: 'flagged',
    toolName: 'read', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread });
  linked('begin', { policy: { rules: [{ id: 'r', text: 'Linked rule', enforcement: 'WARN' }] } });
  linked('validation', { valid: true });
  linked('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
  assert.equal(await writer.drain(10_000), true);
  await new Promise(resolve => setTimeout(resolve, 20));
  for (const sessionId of ['busy-a', 'busy-b', 'busy-c']) {
    for (let n = 0; n < 110; n++) {
      writer.bind({ sessionId, invocationId: `${sessionId}-${n}`, callId: `${sessionId}-${n}`,
        toolName: 'read', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main' })('begin', {});
    }
  }
  assert.equal(await writer.close(10_000), true);
  const index = new ArchiveIndex(root); await index.refresh();
  const status = await index.threadStatus(thread);
  assert.equal(status.linkedCalls, 1);
  assert.equal(status.failures, 1);
  assert.deepEqual(Object.keys(status).sort(), ['coverage', 'failures', 'issues', 'linkedCalls']);
  assert.ok(status.issues.includes('indexing-in-progress'));
}));
test('the summary counts only validated policy FAILs without rereading detailed evidence', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const add = (id: string, enforcement: string, extra: { requestEnforcement?: string; decisionReason?: string; model?: unknown; ruleId?: string; duplicateResult?: boolean } = {}) => {
    const sink = writer.bind({ sessionId: 'summary', invocationId: id, callId: id, toolName: 'edit', cwd: '/tmp',
      mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread });
    sink('begin', { policy: { rules: [{ id: 'r', text: 'Policy text stays on the host', enforcement }] } });
    if (extra.requestEnforcement) sink('request', { payload: { model: 'fixture', state: { action: {}, policy: {}, context: {}, trajectory: {}, integrity: {} }, questions: {} },
      policy: { rules: [{ id: 'r', text: 'Replaced policy', enforcement: extra.requestEnforcement }] }, questionVersion: 'v1', mapping: [] });
    sink('validation', { valid: true });
    const rules = extra.duplicateResult
      ? [{ ruleId: 'r', outcome: { choice: 'PASS' } }, { ruleId: 'r', outcome: { choice: 'FAIL' } }]
      : [{ ruleId: extra.ruleId ?? 'r', outcome: { choice: 'FAIL' } }];
    sink('assessment', { assessment: { model: extra.model ?? 'fixture', rules } });
    if (extra.decisionReason) sink('decision', { decision: 'ALLOW', reason: extra.decisionReason });
  };
  add('valid', 'WARN');
  add('advisory', 'INFO');
  add('replaced', 'BLOCK', { requestEnforcement: 'INFO' });
  add('failed', 'BLOCK', { decisionReason: 'timeout' });
  add('bad-model', 'BLOCK', { model: 42 });
  add('foreign-rule', 'BLOCK', { ruleId: 'not-in-policy' });
  add('duplicate-result', 'BLOCK', { duplicateResult: true });
  await writer.close();
  let reads = 0;
  const index = new ArchiveIndex(root, async (archiveRoot, path) => { reads++; return readPrivateFile(archiveRoot, path); });
  await index.refresh();
  const readsAfterScan = reads;
  const status = index.threadStatus(thread);
  assert.equal(status.linkedCalls, 7);
  assert.equal(status.failures, 1);
  assert.equal(reads, readsAfterScan);
  assert.deepEqual(Object.keys(status).sort(), ['coverage', 'failures', 'issues', 'linkedCalls']);
  assert.ok(!JSON.stringify(status).includes('Policy text stays on the host'));
}));

test('a vanished assessment cannot remain a flagged finding after the next refresh', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const sink = writer.bind({ sessionId: 'missing', invocationId: 'flag', callId: 'flag', toolName: 'edit', cwd: '/tmp',
    mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread });
  sink('begin', { policy: { rules: [{ id: 'r', text: 'Rule', enforcement: 'BLOCK' }] } });
  sink('validation', { valid: true });
  sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
  await writer.close();
  const index = new ArchiveIndex(root); await index.refresh();
  assert.equal(index.threadStatus(thread).failures, 1);
  const { records } = await readArchive(root);
  const assessment = records.find(record => record.stage === 'assessment' && record.bbThreadId === thread)!;
  const folder = join(root, recordSessionKey(assessment));
  let removed = false;
  for (const name of await readdir(folder)) {
    if (!name.endsWith('.json')) continue;
    const path = join(folder, name);
    if (JSON.parse(await readFile(path, 'utf8')).eventId === assessment.eventId) { await rm(path); removed = true; }
  }
  assert.equal(removed, true);
  const detail = await index.detail(recordSessionKey(assessment), recordInvocationKey(assessment), thread);
  assert.ok(detail.issues.some(issue => issue.reason === 'record-unavailable'));
  await index.refresh();
  const status = index.threadStatus(thread);
  assert.equal(status.linkedCalls, 1);
  assert.equal(status.failures, 0);
  assert.ok(status.issues.includes('missing-stages'));
}));

test('Pi guard binds BB_THREAD_ID to newly captured assessments and ignores malformed IDs', async () => {
  const { guardHarness } = await import('./guard-harness.js');
  for (const [raw, expected] of [[thread, thread], ['thr_bad!', undefined]] as const) {
    const h = await guardHarness({ env: { TENET_RECORDING: 'on', BB_THREAD_ID: raw } });
    try {
      await h.start(); await h.call('new-call'); await h.assessed('new-call'); await h.emit('session_shutdown');
      const { records } = await readArchive(join(h.cwd, 'archive'));
      assert.ok(records.some(r => r.stage === 'assessment'));
      assert.ok(records.every(r => r.bbThreadId === expected));
    } finally { await h.close(); }
  }
});
