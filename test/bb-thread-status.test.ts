import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBbThreadId, readArchive, recordInvocationKey, recordSessionKey } from '../src/recording/archive.js';
import { FixtureArchiveWriter as ArchiveWriter } from './archive-fixture.js';
import { readPrivateFile } from '../src/recording/files.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { evaluatorThreadId, evaluatorSentinel, writeProviderErrorFixture } from './evaluator-state-fixture.js';

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
  writer.bindHistorical({ ...identity, bbThreadId: thread }, 4)('begin', {});
  writer.bindHistorical({ ...identity, invocationId: 'two' }, 4)('begin', {});
  assert.throws(() => writer.bindHistorical({ ...identity, bbThreadId: 'thr_bad!' }, 4));
  await writer.complete();
  const { records, issues } = await readArchive(root);
  assert.deepEqual(issues, []);
  assert.equal(records.length, 2);
  assert.equal(recordSessionKey(records[0]!), recordSessionKey(records[1]!));
  assert.deepEqual(records.map(r => r.bbThreadId).sort(), [thread, undefined].sort());
}));

test('linked selected FAILs exclude unlinked history and invalid assessments', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const record = (sessionId: string, invocationId: string, bbThreadId: string | undefined, choice: string, valid = true) => {
    const sink = writer.bindHistorical({ sessionId, invocationId, callId: invocationId, toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId }, 4);
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
  const bogus = writer.bindHistorical({ sessionId: 'shared', invocationId: 'bogus', callId: 'bogus', toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 4);
  bogus('begin', { policy: { rules: [{ id: 'real-rule', text: 'Real rule', enforcement: 'BLOCK' }] } });
  bogus('validation', { valid: true });
  bogus('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'not-a-policy-rule', outcome: { choice: 'FAIL' } }] } });
  await writer.complete();
  const index = new ArchiveIndex(root); await index.refresh();
  const summary = index.threadStatus(thread);
  assert.equal(summary.coverage, 'partial');
  assert.equal(summary.linkedCalls, 5);
  assert.equal(summary.failures, 2);
  assert.deepEqual(Object.keys(summary).sort(), ['assessments', 'coverage', 'failures', 'issues', 'linkedCalls', 'notices']);
  const unmonitored = index.threadStatus('thr_000000001234');
  assert.equal(unmonitored.coverage, 'unknown');
  assert.equal(unmonitored.linkedCalls, 0);
  assert.equal(unmonitored.failures, 0);
}));

test('thread coverage reports a missing response stage', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const sink = writer.bindHistorical({ sessionId: 's', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/tmp',
    mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 4);
  sink('begin', { policy: { rules: [{ id: 'r', text: 'Never publish', enforcement: 'BLOCK' }] } });
  sink('request', { payload: { model: 'fixture', state: { action: {}, policy: {}, context: {}, trajectory: {}, integrity: {} }, questions: {} },
    policy: { rules: [{ id: 'r', text: 'Never publish', enforcement: 'BLOCK' }] }, questionVersion: 'v1', mapping: [] });
  sink('validation', { valid: true });
  sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
  sink('decision', { decision: 'BLOCK' }); sink('permission', { outcome: 'blocked' }); sink('execution', { outcome: 'unknown' });
  await writer.complete();
  const index = new ArchiveIndex(root); await index.refresh();
  const status = await index.threadStatus(thread);
  assert.equal(status.failures, 1);
  assert.ok(status.issues.includes('missing-stages'));
}));


test('a recent linked FAIL becomes visible as a bounded cold index catches up', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root }, { events: 512, bytes: 16 * 1024 * 1024 });
  for (let n = 0; n < 280; n++) {
    writer.bindHistorical({ sessionId: 'busy-session', invocationId: `historical-${n}`, callId: `old-${n}`,
      toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main' }, 4)('begin', {});
  }
  await writer.settle();
  assert.equal(await writer.drain(10_000), true);
  await new Promise(resolve => setTimeout(resolve, 20));
  const recent = writer.bindHistorical({ sessionId: 'busy-session', invocationId: 'recent', callId: 'new-call',
    toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 4);
  recent('begin', { policy: { rules: [{ id: 'r', text: 'Recent rule', enforcement: 'BLOCK' }] } });
  recent('validation', { valid: true });
  recent('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
  await writer.settle();
  assert.equal(await writer.close(10_000), true);
  const index = new ArchiveIndex(root); await index.refresh();
  assert.ok(index.threadStatus(thread).issues.includes('indexing-in-progress'));
  for (let pass = 0; pass < 8 && index.status().indexing; pass++) await index.refresh();
  assert.equal(index.status().indexing, false);
  const status = index.threadStatus(thread);
  assert.equal(status.linkedCalls, 1);
  assert.equal(status.failures, 1);
  assert.deepEqual(Object.keys(status).sort(), ['assessments', 'coverage', 'failures', 'issues', 'linkedCalls', 'notices']);
}));

test('a sparse linked session is indexed before dense newer sessions consume the read budget', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root }, { events: 512, bytes: 16 * 1024 * 1024 });
  const linked = writer.bindHistorical({ sessionId: 'linked-session', invocationId: 'flagged', callId: 'flagged',
    toolName: 'read', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 4);
  linked('begin', { policy: { rules: [{ id: 'r', text: 'Linked rule', enforcement: 'WARN' }] } });
  linked('validation', { valid: true });
  linked('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
  await writer.settle();
  assert.equal(await writer.drain(10_000), true);
  await new Promise(resolve => setTimeout(resolve, 20));
  for (const sessionId of ['busy-a', 'busy-b', 'busy-c']) {
    for (let n = 0; n < 110; n++) {
      writer.bindHistorical({ sessionId, invocationId: `${sessionId}-${n}`, callId: `${sessionId}-${n}`,
        toolName: 'read', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main' }, 4)('begin', {});
    }
  }
  await writer.settle();
  assert.equal(await writer.close(10_000), true);
  const index = new ArchiveIndex(root); await index.refresh();
  const status = await index.threadStatus(thread);
  assert.equal(status.linkedCalls, 1);
  assert.equal(status.failures, 1);
  assert.deepEqual(Object.keys(status).sort(), ['assessments', 'coverage', 'failures', 'issues', 'linkedCalls', 'notices']);
  assert.ok(status.issues.includes('indexing-in-progress'));
}));
test('the summary counts only validated policy FAILs without rereading detailed evidence', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const add = (id: string, enforcement: string, extra: { requestEnforcement?: string; decisionReason?: string; model?: unknown; ruleId?: string; duplicateResult?: boolean } = {}) => {
    const sink = writer.bindHistorical({ sessionId: 'summary', invocationId: id, callId: id, toolName: 'edit', cwd: '/tmp',
      mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 4);
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
  await writer.complete();
  let reads = 0;
  const index = new ArchiveIndex(root, async (archiveRoot, path) => { reads++; return readPrivateFile(archiveRoot, path); });
  await index.refresh();
  const readsAfterScan = reads;
  const status = index.threadStatus(thread);
  assert.equal(status.linkedCalls, 7);
  assert.equal(status.failures, 1);
  assert.equal(reads, readsAfterScan);
  assert.deepEqual(Object.keys(status).sort(), ['assessments', 'coverage', 'failures', 'issues', 'linkedCalls', 'notices']);
  assert.ok(!JSON.stringify(status).includes('Policy text stays on the host'));
}));

test('a vanished assessment cannot remain a flagged finding after the next refresh', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const sink = writer.bindHistorical({ sessionId: 'missing', invocationId: 'flag', callId: 'flag', toolName: 'edit', cwd: '/tmp',
    mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 4);
  sink('begin', { policy: { rules: [{ id: 'r', text: 'Rule', enforcement: 'BLOCK' }] } });
  sink('validation', { valid: true });
  sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
  await writer.complete();
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


test('two terminal schema-3 provider errors are evaluator failures, not selected FAILs or unfinished checks', () => fixture(async root => {
  await writeProviderErrorFixture(root);
  const index = new ArchiveIndex(root); await index.refresh();
  const status = index.threadStatus(evaluatorThreadId);
  assert.equal(status.linkedCalls, 2);
  assert.equal(status.failures, 0);
  assert.deepEqual(status.assessments, { completed: 0, unavailable: 2, pending: 0, dropped: 0, cancelled: 0, incomplete: 0,
    reasons: [{ code: 'provider-error', count: 2 }] });
  assert.equal(status.notices.incomplete, 0);
  assert.deepEqual(status.issues, []);
  const findings = await index.threadFindings(evaluatorThreadId);
  assert.deepEqual(findings.assessments, status.assessments);
  assert.deepEqual(findings.items, []);
  assert.ok(!JSON.stringify([status, findings]).includes(evaluatorSentinel));
  const session = index.sessions().items[0]!;
  assert.equal(session.categoryCounts.unavailable, 2);
  assert.equal(session.categoryCounts.pending, 0);
  for (const row of index.invocations(session.id).items) {
    assert.equal(row.failure, 'provider-error');
    assert.equal(row.execution, 'executed');
    assert.equal(row.permission, 'released');
    assert.deepEqual(row.categories, ['unavailable']);
  }
}));


test('recorded lifecycle states, invalid responses and missing capture stay separate from archive warnings', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root }, { events: 512, bytes: 16 * 1024 * 1024 });
  for (const schema of [3, 4] as const) {
    for (const state of ['completed', 'pending', 'cancelled', 'dropped', 'invalid', 'malformed', 'missing', 'partial-completed', 'unknown-error']) {
      const identity = { sessionId: `states-${schema}`, invocationId: state, callId: state, toolName: 'read', cwd: '/synthetic',
        mode: 'observe' as const, host: 'pi', contextId: 'main', bbThreadId: thread };
      const sink = schema === 3 ? writer.bindHistorical(identity, 3) : writer.bind(identity);
      sink('begin', {});
      if (state === 'missing') continue;
      if (state === 'completed') {
        sink('validation', { valid: true });
        sink('assessment', { assessment: { model: 'offline', rules: [] } });
        sink('assessment-status', { status: 'completed' });
      } else if (state === 'invalid' || state === 'malformed') {
        sink('validation', { valid: false, ...(state === 'invalid' ? { reason: 'invalid-response' } : {}) });
        sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'unvalidated', outcome: { choice: 'FAIL' } }] } });
        sink('assessment-status', { status: 'unavailable', ...(state === 'invalid' ? { reason: 'invalid-response' } : {}) });
      } else if (state === 'unknown-error') {
        sink('assessment-status', { status: 'unavailable', reason: evaluatorSentinel });
      } else {
        if (state === 'cancelled' || state === 'dropped') sink('validation', { valid: false });
        sink('assessment-status', { status: state === 'partial-completed' ? 'completed' : state,
          reason: state === 'dropped' ? 'queue-capacity' : state === 'cancelled' ? 'host-cancelled' : undefined });
      }
      sink('permission', { outcome: 'released' });
      sink('execution', { outcome: 'unknown' });
    }
  }
  await writer.complete();
  const index = new ArchiveIndex(root); await index.refresh();
  const status = index.threadStatus(thread);
  assert.equal(status.failures, 0);
  assert.equal(status.linkedCalls, 18);
  assert.deepEqual(status.assessments, { completed: 2, unavailable: 6, pending: 2, dropped: 2, cancelled: 2, incomplete: 4,
    reasons: [{ code: 'assessment-unavailable', count: 2 }, { code: 'invalid-response', count: 2 }, { code: 'validation-failed', count: 2 }] });
  assert.equal(status.notices.incomplete, 4);
  assert.ok(status.issues.includes('missing-stages'));
  assert.ok(!JSON.stringify(status).includes(evaluatorSentinel));
  const findings = await index.threadFindings(thread);
  assert.deepEqual(findings.assessments, status.assessments);
  assert.deepEqual(findings.items, []);
  for (const session of index.sessions().items) {
    const rows = index.invocations(session.id).items;
    for (const state of ['pending', 'cancelled', 'dropped']) {
      const row = rows.find(row => row.callId === state)!;
      assert.equal(row.assessmentStatus, state);
      assert.deepEqual(row.categories, ['pending']);
      assert.equal(row.execution, 'unknown');
    }
    for (const state of ['invalid', 'malformed', 'unknown-error']) assert.deepEqual(rows.find(row => row.callId === state)!.categories, ['unavailable']);
  }
}));


test('unvalidated UNKNOWN results do not add assessment uncertainty beside an evaluator failure', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  for (const valid of [true, false]) {
    const sink = writer.bindHistorical({ sessionId: 'unknown-results', invocationId: String(valid), callId: String(valid),
      toolName: 'read', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 3);
    sink('begin', {});
    sink('validation', { valid });
    sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'UNKNOWN' } }] } });
    sink('assessment-status', { status: valid ? 'completed' : 'unavailable', ...(valid ? {} : { reason: 'invalid-response' }) });
  }
  await writer.complete();
  const index = new ArchiveIndex(root); await index.refresh();
  assert.equal(index.threadStatus(thread).notices.uncertain, 1);
  const rows = index.invocations(index.sessions().items[0]!.id).items;
  assert.deepEqual(rows.find(row => row.callId === 'true')!.categories, ['uncertainty']);
  assert.deepEqual(rows.find(row => row.callId === 'false')!.categories, ['unavailable']);
}));


test('pending, dropped or cancelled assessments cannot become validated selected-FAIL findings', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  for (const state of ['completed', 'pending', 'dropped', 'cancelled']) {
    const sink = writer.bindHistorical({ sessionId: 'retained-assessments', invocationId: state, callId: state,
      toolName: 'read', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: thread }, 3);
    sink('begin', { policy: { rules: [{ id: 'r', text: 'Synthetic rule', enforcement: 'WARN' }] } });
    sink('validation', { valid: true });
    sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome: { choice: 'FAIL' } }] } });
    sink('assessment-status', { status: state });
  }
  await writer.complete();
  const index = new ArchiveIndex(root); await index.refresh();
  assert.equal(index.threadStatus(thread).failures, 1);
  const page = await index.threadFindings(thread);
  assert.deepEqual(page.items.map(item => item.callId), ['completed']);
  const rows = index.invocations(index.sessions().items[0]!.id).items;
  for (const state of ['pending', 'dropped', 'cancelled']) assert.deepEqual(rows.find(row => row.callId === state)!.categories, ['pending']);
  assert.deepEqual(page.assessments, { completed: 1, unavailable: 0, pending: 1, dropped: 1, cancelled: 1, incomplete: 0, reasons: [] });
  // A lifecycle change during a selected detail read must also reject the retained FAIL.
  let cancelOnRead = false;
  const fresh = new ArchiveIndex(root, async (archive, path) => {
    const text = await readPrivateFile(archive, path);
    const record = JSON.parse(text);
    if (cancelOnRead && record.stage === 'assessment-status' && record.callId === 'completed') {
      return JSON.stringify({ ...record, data: { ...record.data, status: 'cancelled' } });
    }
    return text;
  });
  await fresh.refresh();
  cancelOnRead = true;
  const changed = await fresh.threadFindings(thread);
  assert.deepEqual(changed.items, []);
  assert.ok(changed.issues.includes('detail-unavailable'));
}));
