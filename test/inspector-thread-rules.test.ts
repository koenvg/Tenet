import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ruleRecording, refreshRules } from './session-rules-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { overviewSchema, overviewSelectionSchema } from '../bb-plugin-tenet-status/overview-contract.js';
import { recordFixture } from './recording-fixture.js';
import { projectThreadRules } from '../src/inspector/thread-rules.js';
import { sessionRuleStage } from '../src/inspector/session-rules.js';
import { recordedRulePreviews } from '../src/inspector/action-preview.js';
import { recordInvocationKey, recordSessionKey, sessionKey } from '../src/recording/archive.js';
import { validRecord } from '../src/recording/contract.js';

const threadId = 'thr_abcdefgh1234', other = 'thr_wxyzabcd1234';
const sentinel = 'RAW-THREAD-RULE-SENTINEL';
async function fixture(run: (writer: FixtureArchiveWriter, index: ArchiveIndex, root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-thread-rules-')));
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  const index = new ArchiveIndex(root);
  try { await run(writer, index, root); } finally { await writer.close(); await index.close(); await rm(root, { recursive: true, force: true }); }
}
function record(writer: FixtureArchiveWriter, session: string, invocation: string, outcome: string, link = threadId, mutate = (_data: any) => {}) {
  const data = ruleRecording({ outcome });
  data.begin.policy.source = `/private/${sentinel}/TENET.md`;
  data.begin.action = { arguments: sentinel };
  mutate(data);
  const sink = writer.bindHistorical({ sessionId: session, invocationId: invocation, callId: invocation, toolName: 'edit', cwd: '/synthetic', host: 'pi', contextId: 'main', bbThreadId: link, mode: 'observe' }, 4);
  for (const [stage, value] of Object.entries(data)) if (value !== undefined) sink(stage as any, value);
  return sink;
}

test('default overview lists exact-thread recorded rules across sessions without selecting a call', () => fixture(async (writer, index) => {
  record(writer, 'shared', 'same-id', 'PASS');
  record(writer, 'shared', 'foreign', 'FAIL', other);
  record(writer, 'resumed', 'same-id', 'FAIL');
  await writer.complete(); await refreshRules(index);
  const data = await index.threadOverview(threadId);
  assert.equal(data.selected, null);
  assert.equal(data.selectedId, null);
  assert.equal(data.threadRules?.kind, 'inventory');
  assert.equal(data.threadRules?.summary.status, 'violation');
  assert.deepEqual(data.threadRules?.items.map(row => [row.label, row.status, row.checks]).sort(), [
    ['historical-integrity', 'clear', 2], ['r', 'violation', 2],
  ]);
  assert.equal(JSON.stringify(data).includes(sentinel), false);
}));

test('thread inventory preserves four statuses, history, missing identity, conflicts and unknown gates safely', () => fixture(async (writer, index) => {
  for (const [name, outcome] of [['clear', 'PASS'], ['violation', 'FAIL'], ['unclear', 'UNKNOWN'], ['unchecked', 'PASS']]) {
    record(writer, 's', name!, outcome!, threadId, data => {
      data.begin.policy.digest = name;
      if (name === 'unchecked') { delete data.assessment; delete data.validation; delete data.decision; }
    });
  }
  record(writer, 's', 'gate', 'PASS', threadId, data => { data.begin.policy.digest = 'gate'; data.decision.contributions[0].gates = [sentinel]; data.decision.reason = sentinel; });
  record(writer, 's', 'invalid', 'FAIL', threadId, data => { data.begin.policy.digest = 'invalid'; data.validation.valid = false; data.validation.reason = sentinel; });
  record(writer, 's', 'missing-a', 'PASS', threadId, data => { delete data.begin.policy.source; });
  record(writer, 's', 'missing-b', 'PASS', threadId, data => { delete data.begin.policy.source; });
  record(writer, 's', 'conflict-a', 'PASS', threadId, data => { data.begin.policy.digest = 'conflict'; });
  record(writer, 's', 'conflict-b', 'PASS', threadId, data => { data.begin.policy.digest = 'conflict'; data.begin.policy.rules[0].text = 'Different recorded wording.'; });
  await writer.complete(); await refreshRules(index);
  const data = await index.threadOverview(threadId);
  const rules = data.threadRules!;
  assert.equal(rules.kind, 'inventory');
  if (rules.kind !== 'inventory') throw new Error('expected inventory');
  const policy = rules.items.filter(row => !row.builtin);
  assert.deepEqual(policy.map(row => row.status).sort(), ['clear', 'clear', 'clear', 'unchecked', 'unclear', 'unclear', 'unclear', 'unclear', 'violation']);
  assert.equal(policy.filter(row => row.policyId === null).length, 2);
  assert.equal(policy.filter(row => row.conflict).length, 1);
  assert.equal(policy.find(row => row.conflict)!.excerptState, 'conflict');
  assert.equal(rules.summary.inventory, 'unknown');
  const selected = await index.threadOverview(threadId, { query: { kind: 'checks', ruleId: policy.find(row => row.status === 'violation')!.id } });
  assert.equal(selected.threadRules!.kind, 'checks');
  assert.equal(selected.selected, null);
  for (const row of policy) {
    const checks = await index.threadOverview(threadId, { query: { kind: 'checks', ruleId: row.id } });
    assert.equal(JSON.stringify(checks).includes(sentinel), false);
    if (checks.threadRules!.kind !== 'inventory') for (const check of checks.threadRules!.items) {
      const call = await index.threadOverview(threadId, { query: { kind: 'call', ruleId: row.id, sessionId: check.sessionId, callId: check.callId } });
      assert.ok(call.selected);
      if (check.gates?.includes('unrecognized-gate')) assert.equal(check.status, 'unclear');
    }
  }
}));

test('inventory and check pages bind exact thread, owner scope and revision before pagination', () => fixture(async (writer, index) => {
  for (let n = 0; n < 55; n++) {
    record(writer, `session-${n}`, 'same', n === 0 ? 'FAIL' : 'PASS');
    record(writer, 'many-rules', `rule-${n}`, 'PASS', threadId, data => { data.begin.policy.digest = `version-${n}`; });
    await writer.settle();
  }
  await writer.settle(); await refreshRules(index);
  const first = await index.threadOverview(threadId, {}, 'a'.repeat(64));
  assert.equal(first.selected, null);
  assert.equal(first.threadRules!.summary.status, 'violation');
  const rules = first.threadRules!;
  if (rules.kind !== 'inventory') throw new Error('expected inventory');
  assert.equal(rules.items.length, 50); assert.ok(rules.next);
  const next = await index.threadOverview(threadId, { query: { kind: 'inventory', inventoryCursor: rules.next! } }, 'a'.repeat(64));
  assert.equal(next.threadRules!.items.length, 50);
  const rule = rules.items.find(row => row.checks === 55) ?? (next.threadRules!.kind === 'inventory' ? next.threadRules!.items.find(row => row.checks === 55) : undefined);
  assert.ok(rule);
  const selected = await index.threadOverview(threadId, { query: { kind: 'checks', ruleId: rule.id } }, 'a'.repeat(64));
  if (selected.threadRules!.kind === 'inventory') throw new Error('expected checks');
  assert.equal(selected.threadRules!.items.length, 50); assert.ok(selected.threadRules!.next);
  const older = await index.threadOverview(threadId, { query: { kind: 'checks', ruleId: rule.id, checkCursor: selected.threadRules!.next! } }, 'a'.repeat(64));
  assert.equal(older.threadRules!.items.length, 5);
  await assert.rejects(index.threadOverview(other, { query: { kind: 'inventory', inventoryCursor: rules.next! } }, 'a'.repeat(64)));
  await assert.rejects(index.threadOverview(threadId, { query: { kind: 'inventory', inventoryCursor: rules.next! } }, 'b'.repeat(64)));
  await assert.rejects(index.threadOverview(threadId, { query: { kind: 'checks', ruleId: rule.id, checkCursor: rules.next! } }, 'a'.repeat(64)));
  record(writer, 'later', 'later', 'FAIL'); await writer.complete(); await refreshRules(index);
  await assert.rejects(index.threadOverview(threadId, { query: { kind: 'inventory', inventoryCursor: rules.next! } }, 'a'.repeat(64)), /stale-cursor/);
}));

test('no linked recordings is unknown inventory, never a known empty clear fold', () => fixture(async (writer, index) => {
  record(writer, 'foreign', 'foreign', 'PASS', other); await writer.complete(); await refreshRules(index);
  const data = await index.threadOverview(threadId);
  assert.equal(data.threadRules!.summary.inventory, 'unknown');
  assert.equal(data.threadRules!.summary.status, 'unchecked');
  assert.deepEqual(data.threadRules!.summary.reasons, ['no-linked-recordings']);
}));

test('safe overview transport rejects extra private fields, oversized UTF-8 and mixed navigation', () => fixture(async (writer, index) => {
  record(writer, 's', 'c', 'PASS', threadId, data => { data.begin.policy.rules[0].text = '雪'.repeat(300); });
  await writer.complete(); await refreshRules(index);
  const data = await index.threadOverview(threadId); overviewSchema.parse(data);
  const rules = data.threadRules!;
  if (rules.kind !== 'inventory') throw new Error('expected inventory');
  const row = rules.items.find(row => !row.builtin)!;
  assert.ok(Buffer.byteLength(row.excerpt!) <= 512); assert.equal(row.excerptState, 'shortened');
  for (const extra of [{ policyIdentity: sentinel }, { origin: { source: sentinel } }, { ruleStage: sentinel }, { metadata: sentinel }])
    assert.throws(() => overviewSchema.parse({ ...data, threadRules: { ...rules, items: [{ ...row, ...extra }] } }));
  assert.throws(() => overviewSchema.parse({ ...data, threadRules: { ...rules, items: [{ ...row, excerpt: '雪'.repeat(200) }] } }));
  assert.throws(() => overviewSchema.parse({ ...data, revision: 'f'.repeat(64) }));
  assert.equal(overviewSelectionSchema.safeParse({ query: { kind: 'checks', ruleId: row.id, inventoryCursor: 'x' } }).success, false);
  assert.equal(overviewSelectionSchema.safeParse({ query: { kind: 'checks', ruleId: row.id }, callId: 'f'.repeat(64) }).success, false);
  assert.equal(overviewSelectionSchema.safeParse({ query: { kind: 'inventory', readScope: 'f'.repeat(64) } }).success, false);
}));

test('retention caps disclose omissions while later folds still flag an old check beyond retained history', async () => {
  type Observation = Parameters<typeof projectThreadRules>[0][number];
  const observations = new Map<string, Observation>();
  const writer = new FixtureArchiveWriter({ enabled: true, directory: '/synthetic/in-memory' }, undefined,
    async (_root, _folder, _name, text) => {
      const captured: unknown = JSON.parse(text);
      assert.ok(validRecord(captured), 'valid historical stage');
      // Sequence-based time keeps the first failure oldest and the repeated declaration newest.
      const stage = { ...captured, timestamp: captured.sequence };
      const session = recordSessionKey(stage);
      const id = sessionKey(JSON.stringify([threadId, session, recordInvocationKey(stage)]));
      let observation = observations.get(id);
      if (!observation) {
        observation = { id, sessionId: sessionKey(JSON.stringify([threadId, session])), stages: [], previews: [] };
        observations.set(id, observation);
      }
      observation.stages.push(sessionRuleStage(stage));
      observation.previews.push(...recordedRulePreviews(stage.data, stage.stage) ?? []);
    });
  try {
    for (let n = 0; n < 4101; n++) {
      record(writer, 'check-history', `check-${n}`, n === 0 ? 'FAIL' : 'PASS'); await writer.settle();
    }
    for (let n = 0; n < 520; n++) {
      record(writer, 'rule-history', `policy-${n}`, 'PASS', threadId, data => { data.begin.policy.digest = `policy-${n}`; }); await writer.settle();
    }
    record(writer, 'check-history', 'latest-check', 'PASS'); await writer.complete();
  } finally { await writer.close(); }
  assert.equal(writer.health().written, 18488);
  assert.equal(observations.size, 4622);
  const context = { threadId, readScope: sessionKey('retention-fixture'), revision: sessionKey('retention-revision'),
    indexing: false, archiveIssues: false, writerLoss: false };
  const data = projectThreadRules([...observations.values()], { kind: 'inventory' }, context);
  let page = data;
  assert.equal(data.kind, 'inventory');
  assert.equal(data.summary.retainedRules, 1024);
  assert.equal(data.summary.inventory, 'unknown');
  assert.ok(data.summary.omittedRules > 0);
  assert.equal(data.summary.omittedChecks, 12);
  assert.equal(data.summary.status, 'violation');
  assert.deepEqual(data.items.filter(row => row.checks === 4102).map(row => row.builtin).sort(), [false, true]);
  let rule;
  while (page.kind === 'inventory') {
    rule = page.items.find(row => !row.builtin && row.checks === 4102);
    if (rule || !page.next) break;
    page = projectThreadRules([...observations.values()], { kind: 'inventory', inventoryCursor: page.next }, context);
  }
  assert.ok(rule, 'retained repeated declaration');
  assert.equal(rule.status, 'violation');
  const checks = projectThreadRules([...observations.values()], { kind: 'checks', ruleId: rule.id }, context);
  assert.equal(checks.kind, 'checks');
  assert.equal(checks.omittedChecks, 6); assert.equal(checks.rule.checks, 4102); assert.equal(checks.rule.status, 'violation');
  assert.equal(checks.items.every(check => check.status === 'clear'), true);
});

async function files(root: string) {
  const paths: string[] = [];
  for (const session of await readdir(root, { withFileTypes: true })) if (session.isDirectory()) {
    for (const file of await readdir(join(root, session.name))) if (file.endsWith('.json')) paths.push(join(root, session.name, file));
  }
  return paths;
}
test('current schema-five captured contracts fold as recorded without current-policy reconstruction', () => fixture(async (_writer, index, root) => {
  await recordFixture(root);
  for (const path of await files(root)) {
    const value = JSON.parse(await readFile(path, 'utf8'));
    value.bbThreadId = threadId;
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  }
  await refreshRules(index);
  const data = await index.threadOverview(threadId); overviewSchema.parse(data);
  assert.equal(data.threadRules!.summary.status, 'violation');
  if (data.threadRules!.kind !== 'inventory') throw new Error('expected inventory');
  const rule = data.threadRules!.items.find(row => !row.builtin)!;
  assert.equal(rule.role, 'project'); assert.equal(rule.status, 'violation');
  const selected = await index.threadOverview(threadId, { query: { kind: 'checks', ruleId: rule.id } });
  if (selected.threadRules!.kind === 'inventory') throw new Error('expected checks');
  assert.equal(selected.threadRules!.items.every(check => check.question === 'current' && check.input === 'current'), true);
}));

test('replacement, corruption and withdrawal invalidate pages and reject changed detail snapshots', () => fixture(async (writer, index, root) => {
  record(writer, 's', 'c', 'PASS'); await writer.complete(); await refreshRules(index);
  const before = await index.threadOverview(threadId);
  if (before.threadRules!.kind !== 'inventory') throw new Error('expected inventory');
  const rule = before.threadRules!.items.find(row => !row.builtin)!;
  const checks = (await index.threadOverview(threadId, { query: { kind: 'checks', ruleId: rule.id } })).threadRules!;
  if (checks.kind === 'inventory') throw new Error('expected checks');
  const check = checks.items[0]!;
  const address = { query: { kind: 'call' as const, ruleId: rule.id, sessionId: check.sessionId, callId: check.callId } };
  const paths = await files(root);
  let changed = '';
  for (const path of paths) {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (value.stage === 'begin') { value.data.policy.rules[0].text = 'Replaced recorded wording.'; await writeFile(path, JSON.stringify(value)); changed = path; }
  }
  const stale = await index.threadOverview(threadId, address);
  assert.equal(stale.selected, null); assert.ok(stale.issues.includes('detail-unavailable'));
  await refreshRules(index);
  const replacement = await index.threadOverview(threadId);
  assert.notEqual(replacement.revision, before.revision);
  await assert.rejects(index.threadOverview(threadId, { query: { kind: 'checks', ruleId: rule.id, revision: before.revision } }), /stale-cursor/);
  await writeFile(changed, `{${sentinel}`); await refreshRules(index);
  const corrupt = await index.threadOverview(threadId);
  assert.equal(corrupt.threadRules!.summary.inventory, 'unknown');
  assert.ok(corrupt.issues.includes('corrupt-record')); assert.equal(JSON.stringify(corrupt).includes(sentinel), false);
  for (const path of paths) await rm(path);
  await refreshRules(index);
  const withdrawn = await index.threadOverview(threadId);
  assert.equal(withdrawn.linkedCalls, 0); assert.equal(withdrawn.threadRules!.summary.inventory, 'unknown');
  await assert.rejects(index.threadOverview(threadId, address), /invalid-selection/);
}));
