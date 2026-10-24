import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, readFile, writeFile, readdir, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { sessionKey } from '../src/recording/archive.js';

import { materializeStaticRuleHistory } from './static-rule-history-fixture.js';
import { ruleRecording, writeRuleRecording, refreshRules } from './session-rules-fixture.js';
import { readPrivateFile } from '../src/recording/files.js';
import { recordFixture } from './recording-fixture.js';
import { recordSessionKey } from '../src/recording/archive.js';
import { recordScopedFixture } from './scoped-recording-fixture.js';
import { combinedPolicyDigest } from '../src/decision/policy.js';
import { policyIntegrity } from '../src/decision/policy-contract.js';
const choice = (selected: string, labels: string[]) => ({ choice: selected,
  probabilities: Object.fromEntries(labels.map(label => [label, label === selected ? 1 : 0])) });
const outcomeLabels = ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'];
const result = (id: string, outcome = 'PASS') => ({ ruleId: id, outcome: choice(outcome, outcomeLabels),
  evidence: choice('SUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']) });


test('multi-session metadata enrichment visits only selected-session stages with identical public summaries', () => fixture(async (root, writer) => {
  for (let n = 0; n < 12; n++) { writeRuleRecording(writer, `session-${n}`, 'i', ruleRecording({ outcome: n === 11 ? 'FAIL' : 'PASS' })); await writer.settle(); }
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await refreshRules(index);
    const scans = (index as any).sessionScans as Map<string, { files: Map<string, any> }>;
    let visits = 0;
    for (const scan of scans.values()) for (const entry of scan.files.values()) {
      const metadata = entry.metadata;
      Object.defineProperty(entry, 'metadata', { configurable: true, get() { visits++; return metadata; } });
    }
    const rows = index.sessions({ limit: 50 }).items;
    assert.deepEqual(rows.map(row => row.status).sort(), [...Array(11).fill('clear'), 'violation']);
    assert.deepEqual(rows.map(row => row.inventory), Array(12).fill({ state: 'known', rules: 2, unchecked: 0 }));
    assert.equal(rows.every(row => row.invocations === 1 && row.coverage === 'best-effort'), true);
    console.log(`METADATA_VISITS=${visits}; SESSIONS=12; STAGES=48; BOUND=400`);
    assert.ok(visits <= 400, `metadata visits ${visits} exceed linear bound 400`);
    assert.deepEqual(index.captureHealth(), []);
    assert.equal(index.sessionRules(sessionKey('session-11')).status, 'violation');
  } finally { await index.close(); }
}));
async function fixture(run: (root: string, writer: FixtureArchiveWriter) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-session-rules-')));
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  try { await run(root, writer); } finally { await writer.close(); await rm(root, { recursive: true, force: true }); }
}

function seed(writer: FixtureArchiveWriter, id: string, mutate: (data: any) => void = () => {}) {
  const data = { begin: { policy: { source: '/synthetic/TENET.md', digest: 'version-a',
    rules: [{ id: 'r', text: 'Only synthetic actions.', enforcement: 'WARN', line: 1 }] },
    integrity: { id: 'historical-integrity', text: 'Protect the recorded policy.' } },
  validation: { valid: true }, assessment: { assessment: { model: 'offline', rules: [result('r', 'FAIL'), result('historical-integrity')] } },
  decision: { decision: 'ALLOW', contributions: [{ ruleId: 'r', gates: [] }, { ruleId: 'historical-integrity', gates: [] }] } };
  mutate(data);
  const sink = writer.bindHistorical({ sessionId: id, invocationId: id, callId: id, toolName: 'edit', cwd: '/synthetic', mode: 'observe' }, 1);
  for (const [stage, value] of Object.entries(data)) if (value !== undefined) sink(stage as any, value);
}

for (const defect of ['valid', 'missing-validation', 'false-validation', 'distribution', 'missing-member', 'duplicate', 'foreign-member', 'unknown-profile'] as const) {
  test(`session status validates the complete recorded assessment before trusting ${defect}`, () => fixture(async (root, writer) => {
    seed(writer, defect, data => {
      if (defect === 'missing-validation') delete data.validation;
      if (defect === 'false-validation') data.validation.valid = false;
      if (defect === 'distribution') data.assessment.assessment.rules[1].outcome.probabilities.PASS = .4;
      if (defect === 'missing-member') data.assessment.assessment.rules.pop();
      if (defect === 'duplicate') data.assessment.assessment.rules[1] = result('r');
      if (defect === 'foreign-member') data.assessment.assessment.rules[1] = result('foreign');
      if (defect === 'unknown-profile') data.begin.profile = 'future';
    });
    await writer.complete();
    const index = new ArchiveIndex(root);
    try {
      await index.refresh();
      const session = index.sessions().items[0]!;
      assert.equal(session.status, defect === 'valid' ? 'violation' : 'unclear');
      assert.deepEqual(session.inventory, { state: 'known', rules: 2, unchecked: 0 });
      const rules = index.sessionRules(sessionKey(defect));
      assert.equal(rules.items.find(row => row.declarationId === 'r')?.status, defect === 'valid' ? 'violation' : 'unclear');
    } finally { await index.close(); }
  }));
}

for (const defect of ['future-question', 'conflicting-assessment', 'malformed-member', 'contradictory-profile', 'missing-integrity', 'oversized-id', 'malformed-profile', 'malformed-question', 'missing-assessment'] as const) {
  test(`unresolved recorded contract stays honest for ${defect}`, () => fixture(async (root, writer) => {
    const data = ruleRecording();
    if (defect === 'future-question') data.begin.questionVersion = 'policy-rules-v100-future';
    if (defect === 'conflicting-assessment') data.validation.assessment = ruleRecording({ outcome: 'FAIL' }).assessment.assessment;
    if (defect === 'malformed-member') data.assessment.assessment.rules.push(null);
    if (defect === 'contradictory-profile') data.decision.profile = 'future';
    if (defect === 'missing-integrity') delete data.begin.integrity;
    if (defect === 'oversized-id') data.begin.policy.rules[0].id = '';
    if (defect === 'malformed-profile') data.begin.profile = 5;
    if (defect === 'malformed-question') data.begin.questionVersion = '';
    if (defect === 'missing-assessment') { data.validation.assessment = data.assessment.assessment; data.assessment = {}; }
    writeRuleRecording(writer, 's', 'i', data);
    await writer.complete();
    const index = new ArchiveIndex(root);
    try {
      await index.refresh();
      const page = index.sessionRules(sessionKey('s'));
      assert.equal(page.status, 'unclear');
      assert.equal(page.inventory.state, ['missing-integrity', 'oversized-id'].includes(defect) ? 'unknown' : 'known');
      if (defect === 'missing-integrity') {
        assert.deepEqual(page.items.map(row => row.declarationId), ['r']);
        assert.deepEqual(page.ruleCoverage.diagnostics.map(item => item.kind), ['missing-recorded-integrity']);
      }
    } finally { await index.close(); }
  }));
}

for (const [outcome, status] of [['PASS', 'clear'], ['FAIL', 'violation'], ['UNKNOWN', 'unclear'], ['APPROVAL_REQUIRED', 'clear'], ['NOT_APPLICABLE', 'clear']] as const) {
  for (const question of ['policy-rules-v6-applicability', 'policy-rules-v7-evidence-selection', 'policy-rules-v7-ordinary-evidence', 'policy-rules-v8-source-set']) {
    test(`historical ${question} preserves ${outcome} as ${status}`, () => fixture(async (root, writer) => {
      writeRuleRecording(writer, 's', 'i', ruleRecording({ outcome, profile: 'applicability-v1', question }));
      await writer.complete(); const index = new ArchiveIndex(root);
      try {
        await index.refresh(); const page = index.sessionRules(sessionKey('s'));
        assert.equal(page.status, status);
        const rule = page.items.find(row => row.declarationId === 'r')!;
        const check = index.ruleChecks(page.session, rule.id).items[0]!;
        assert.deepEqual({ status: check.status, outcome: check.outcome, gates: check.gates, trusted: check.trusted,
          profile: check.profile, question: check.questionVersion, input: check.inputVersion },
        { status, outcome, gates: [], trusted: true, profile: 'applicability-v1', question, input: null });
      } finally { await index.close(); }
    }));
  }
}

for (const outcome of ['PASS', 'FAIL', 'APPROVAL_REQUIRED', 'UNKNOWN']) {
  test(`absent gates stay null for trusted ${outcome}`, () => fixture(async (root, writer) => {
    const data = ruleRecording({ outcome }); delete data.decision.contributions;
    writeRuleRecording(writer, 's', 'i', data); await writer.complete(); const index = new ArchiveIndex(root);
    try {
      await index.refresh(); const page = index.sessionRules(sessionKey('s'));
      const rule = page.items.find(row => row.declarationId === 'r')!;
      const check = index.ruleChecks(page.session, rule.id).items[0]!;
      assert.deepEqual({ status: check.status, outcome: check.outcome, gates: check.gates, trusted: check.trusted },
        { status: 'unclear', outcome, gates: null, trusted: true });
    } finally { await index.close(); }
  }));
}

for (const gate of ['outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold', 'applicability-unresolved']) {
  test(`recorded ${gate} prevents a clear result`, () => fixture(async (root, writer) => {
    const data = ruleRecording(); data.decision.contributions[0].gates = [gate];
    writeRuleRecording(writer, 's', 'i', data); await writer.complete(); const index = new ArchiveIndex(root);
    try {
      await index.refresh(); const page = index.sessionRules(sessionKey('s'));
      assert.equal(page.status, 'unclear');
      const rule = page.items.find(row => row.declarationId === 'r')!;
      assert.deepEqual(index.ruleChecks(page.session, rule.id).items[0]!.gates, [gate]);
    } finally { await index.close(); }
  }));
}

test('current scoped capture keeps validated violations and recorded source/input identity', () => fixture(async (root) => {
  const { records } = await recordFixture(root);
  const index = new ArchiveIndex(root);
  try {
    await refreshRules(index);
    const session = recordSessionKey(records.find(record => record.stage === 'begin')!);
    const page = index.sessionRules(session);
    assert.equal(page.status, 'violation');
    assert.deepEqual(page.inventory, { state: 'known', rules: 2, unchecked: 0 });
    const rule = page.items.find(row => !row.builtin)!;
    assert.equal(rule.origin?.role, 'project');
    assert.equal(rule.policyIdentity?.startsWith('policy-sources-v1:'), true);
    const checks = index.ruleChecks(session, rule.id).items;
    assert.deepEqual(checks.map(check => check.outcome).sort(), ['FAIL', 'PASS']);
    assert.deepEqual(checks.map(check => [check.trusted, check.profile, check.questionVersion, check.inputVersion]), [
      [true, 'applicability-v1', 'policy-rules-v9-scoped', 'judge-input-scopes-v1'],
      [true, 'applicability-v1', 'policy-rules-v9-scoped', 'judge-input-scopes-v1']]);
    assert.equal((await index.selectedRule(session, rule.id))?.wording.state, 'available');
  } finally { await index.close(); }
}));

test('prepared scoped input alone is unchecked, an interrupted known attempt is unclear', () => fixture(async (root) => {
  await recordScopedFixture(root, false);
  const index = new ArchiveIndex(root);
  try {
    const folders = await readdir(root);
    const folder = join(root, folders[0]!);
    for (const file of await readdir(folder)) {
      const path = join(folder, file), record = JSON.parse(await readFile(path, 'utf8'));
      if (!['begin', 'request'].includes(record.stage)) await rm(path);
    }
    await refreshRules(index);
    const session = index.sessions().items[0]!;
    const page = index.sessionRules(session.id);
    assert.equal(page.status, 'unchecked');
    assert.deepEqual(page.inventory, { state: 'known', rules: 2, unchecked: 2 });
    assert.equal(index.ruleChecks(session.id, page.items[0]!.id).items.length, 0);
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    const sink = writer.bindHistorical({ sessionId: 'interrupted', invocationId: 'i', callId: 'i', host: 'pi', contextId: 'main', toolName: 'edit', cwd: '/synthetic', mode: 'observe' }, 3);
    sink('begin', ruleRecording().begin); sink('assessment-status', { status: 'cancelled', reason: 'host-cancelled' });
    await writer.complete(); await refreshRules(index);
    const interrupted = index.sessions().items.find(item => item.sessionId === 'interrupted')!;
    assert.equal(interrupted.status, 'unclear');
    const rule = index.sessionRules(interrupted.id).items.find(item => !item.builtin)!;
    const check = index.ruleChecks(interrupted.id, rule.id).items[0]!;
    assert.deepEqual({ reason: check.reason, status: check.status, outcome: check.outcome }, { reason: 'host-cancelled', status: 'unclear', outcome: null });
  } finally { await index.close(); }
}));

test('all indexed calls and versions determine status before rule, check and call pages', () => fixture(async (root, writer) => {
  for (let n = 0; n < 110; n++) {
    writeRuleRecording(writer, 'checks', `i${n}`, ruleRecording({ outcome: n === 109 ? 'FAIL' : 'PASS' }));
    writeRuleRecording(writer, 'versions', `v${n}`, ruleRecording({ version: `v${n}`, outcome: n === 109 ? 'FAIL' : 'PASS' }));
    if (n % 4 === 0) await writer.settle();
  }
  await writer.complete(); let reads = 0;
  const index = new ArchiveIndex(root, async (root, path) => { reads++; return readPrivateFile(root, path); });
  try {
    await index.refresh();
    assert.equal(index.indexing, true);
    assert.equal(index.sessions().items.every(item => item.inventory.state === 'unknown'), true);
    await refreshRules(index); const coldReads = reads;
    const summary = index.sessions().items.find(row => row.sessionId === 'checks')!;
    assert.equal(summary.status, 'violation');
    assert.deepEqual(summary.inventory, { state: 'known', rules: 2, unchecked: 0 });
    const rules = index.sessionRules(summary.id);
    const rule = rules.items.find(row => !row.builtin)!;
    assert.equal(rule.checks, 110);
    const first = index.ruleChecks(summary.id, rule.id, { limit: 100 });
    const second = index.ruleChecks(summary.id, rule.id, { cursor: first.next! });
    assert.equal(first.items.length, 100); assert.equal(second.items.length, 10);
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 110);
    assert.equal(index.invocations(summary.id, { category: 'approval' }).items.length, 0);
    assert.equal(index.sessionRules(summary.id).status, 'violation');
    const versionPage = index.sessionRules(sessionKey('versions'), { limit: 100 });
    assert.deepEqual(versionPage.inventory, { state: 'known', rules: 220, unchecked: 0 });
    assert.equal(versionPage.items.length, 100);
    const versionNext = index.sessionRules(sessionKey('versions'), { limit: 100, cursor: versionPage.next! });
    const versionLast = index.sessionRules(sessionKey('versions'), { limit: 100, cursor: versionNext.next! });
    assert.equal(versionNext.items.length, 100); assert.equal(versionLast.items.length, 20);
    assert.throws(() => index.sessionRules(summary.id, { cursor: versionPage.next! }), /invalid-page/);
    assert.throws(() => index.ruleChecks(summary.id, rules.items.find(row => row.builtin)!.id, { cursor: first.next! }), /invalid-page/);
    await index.refresh(); index.sessions(); index.sessionRules(summary.id); index.ruleChecks(summary.id, rule.id);
    assert.equal(reads, coldReads);
  } finally { await index.close(); }
}));

test('source replacement, corruption and withdrawal invalidate cursors and never substitute exact wording', () => fixture(async (root, writer) => {
  writeRuleRecording(writer, 's', 'i', ruleRecording()); await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await index.refresh(); const session = sessionKey('s'), page = index.sessionRules(session, { limit: 1 });
    const rule = index.sessionRules(session).items.find(row => !row.builtin)!;
    assert.deepEqual((await index.selectedRule(session, rule.id))?.wording,
      { state: 'available', text: 'Only synthetic actions. <script>inert()</script>' });
    const folder = join(root, session);
    const begin = (await Promise.all((await readdir(folder)).map(async file => ({ file,
      record: JSON.parse(await readFile(join(folder, file), 'utf8')) })))).find(item => item.record.stage === 'begin')!.file;
    const path = join(folder, begin), record = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(`${path}.swap`, JSON.stringify(record), { mode: 0o600 }); await rename(`${path}.swap`, path);
    assert.deepEqual((await index.selectedRule(session, rule.id))?.wording,
      { state: 'unavailable', reason: 'source-unavailable-or-changed' });
    await index.refresh();
    assert.deepEqual((await index.selectedRule(session, rule.id))?.wording,
      { state: 'available', text: 'Only synthetic actions. <script>inert()</script>' });
    record.data.policy.rules[0].text = 'Replacement wording.';
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    assert.deepEqual((await index.selectedRule(session, rule.id))?.wording,
      { state: 'unavailable', reason: 'source-unavailable-or-changed' });
    await index.refresh();
    assert.throws(() => index.sessionRules(session, { cursor: page.next! }), /stale-cursor/);
    assert.deepEqual((await index.selectedRule(session, rule.id))?.wording, { state: 'available', text: 'Replacement wording.' });
    await writeFile(path, '{corrupt', { mode: 0o600 }); await index.refresh();
    assert.equal(index.sessionRules(session).inventory.state, 'unknown');
    assert.equal(index.sessionRules(session).status, 'unclear');
    await rm(folder, { recursive: true }); await index.refresh();
    assert.equal(index.sessions().items.length, 0);
    assert.equal(await index.selectedRule(session, rule.id), null);
    assert.equal(index.sessionRules(session).inventory.state, 'unknown');
    await mkdir(folder, { mode: 0o700 }); await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    await refreshRules(index);
    assert.equal(index.sessionRules(session).items[0]!.status, 'unchecked');
  } finally { await index.close(); }
}));

test('known untouched declarations qualify clear; unknown policy identities remain isolated', () => fixture(async (root, writer) => {
  writeRuleRecording(writer, 's', 'checked', ruleRecording());
  writeRuleRecording(writer, 's', 'untouched', { begin: ruleRecording({ version: 'other' }).begin });
  for (const invocation of ['unknown-a', 'unknown-b']) {
    const data = ruleRecording(); delete data.begin.policy.source;
    writeRuleRecording(writer, 'unknown', invocation, data);
  }
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await index.refresh(); const page = index.sessionRules(sessionKey('s'));
    assert.equal(page.status, 'clear'); assert.deepEqual(page.inventory, { state: 'known', rules: 4, unchecked: 2 });
    const unknown = index.sessionRules(sessionKey('unknown'));
    assert.equal(unknown.status, 'unclear'); assert.equal(unknown.inventory.state, 'unknown');
    assert.equal(unknown.items.length, 4); assert.equal(new Set(unknown.items.map(row => row.id)).size, 4);
    assert.deepEqual(unknown.items.map(row => row.policyIdentity), [null, null, null, null]);
  } finally { await index.close(); }
}));

for (const malformed of [false, true]) {
  test(`full shape is validated before fact caps, malformed tail ${malformed}`, () => fixture(async (root, writer) => {
    const data = ruleRecording({ rules: 130 });
    data.assessment.assessment.rules[129].outcome = choice('FAIL', outcomeLabels);
    if (malformed) data.assessment.assessment.rules[129].evidence = null;
    writeRuleRecording(writer, 's', 'i', data); await writer.complete(); const index = new ArchiveIndex(root);
    try {
      await index.refresh(); const page = index.sessionRules(sessionKey('s'), { limit: 100 });
      assert.equal(page.status, malformed ? 'unclear' : 'violation');
      assert.equal(page.items.length, 65);
      assert.equal(page.inventory.state, 'unknown');
      assert.equal(page.ruleCoverage.omittedRules, 66);
      assert.equal(page.ruleCoverage.reasons.includes('rule-facts-overflow'), true);
    } finally { await index.close(); }
  }));
}

test('later validated violation survives a full bounded rule aggregation', () => fixture(async (root, writer) => {
  for (let n = 0; n < 515; n++) {
    writeRuleRecording(writer, 's', `i${n}`, ruleRecording({ version: `v${n}` }));
    if (n % 4 === 0) await writer.settle();
  }
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await refreshRules(index);
    const before = index.sessionRules(sessionKey('s'), { limit: 100 });
    assert.equal(before.status, 'unclear'); assert.equal(before.ruleCoverage.omittedRules, 6);
    const later = new FixtureArchiveWriter({ enabled: true, directory: root });
    writeRuleRecording(later, 's', 'later', ruleRecording({ version: 'last', outcome: 'FAIL' })); await later.complete();
    await refreshRules(index, () => index.sessionRules(sessionKey('s')).status === 'violation');
    const after = index.sessionRules(sessionKey('s'), { limit: 100 });
    assert.equal(after.status, 'violation'); assert.equal(after.inventory.state, 'unknown');
    assert.equal(after.ruleCoverage.omittedRules, 8);
    assert.equal(after.ruleCoverage.reasons.includes('rule-aggregation-overflow'), true);
    assert.throws(() => index.sessionRules(sessionKey('s'), { cursor: before.next! }), /stale-cursor/);
  } finally { await index.close(); }
}));

test('check history overflow is explicit and does not hide a later validated violation', () => fixture(async (root) => {
  await materializeStaticRuleHistory(root); let reads = 0;
  const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
  try {
    await refreshRules(index);
    assert.equal(reads, 8192); assert.equal(index.invocations(sessionKey('s'), { limit: 100 }).items.length, 100);
    assert.equal(index.sessions().items[0]?.invocations, 4096);
    const later = new FixtureArchiveWriter({ enabled: true, directory: root });
    writeRuleRecording(later, 's', 'later', ruleRecording({ outcome: 'FAIL' })); await later.complete(); await refreshRules(index, () => reads === 8196);
    assert.equal(later.health().written, 4);
    assert.equal(reads, 8196); console.log('SAFE_HISTORY_READS=8196; INITIAL_INVOCATIONS=4096; LATER_WRITER_STAGES=4');
    const page = index.sessionRules(sessionKey('s'));
    assert.equal(page.status, 'violation');
    assert.deepEqual(page.items.map(row => row.checks), [4097, 4097]);
    const rule = page.items.find(row => !row.builtin)!;
    assert.equal(rule.checks, 4097);
    const checks = index.ruleChecks(page.session, rule.id, { limit: 100 });
    assert.equal(checks.status, 'violation'); assert.equal(checks.items.length, 100);
    assert.equal(checks.ruleCoverage.omittedChecks, 1);
    assert.equal(checks.ruleCoverage.reasons.includes('check-history-overflow'), true);
  } finally { await index.close(); }
}));

test('contradictory recorded evidence and conflicting wording do not become a clear claim', () => fixture(async (root, writer) => {
  const insufficient = ruleRecording(); insufficient.assessment.assessment.rules[0].evidence = choice('INSUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']);
  writeRuleRecording(writer, 'insufficient', 'i', insufficient);
  writeRuleRecording(writer, 'conflict', 'a', ruleRecording());
  const conflicting = ruleRecording(); conflicting.begin.policy.rules[0].text = 'Conflicting same-identity wording.';
  writeRuleRecording(writer, 'conflict', 'b', conflicting);
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await index.refresh(); assert.equal(index.sessionRules(sessionKey('insufficient')).status, 'unclear');
    const page = index.sessionRules(sessionKey('conflict'));
    assert.equal(page.status, 'unclear'); assert.equal(page.inventory.state, 'unknown');
    const rule = page.items.find(row => !row.builtin)!;
    assert.equal(rule.wordingConflict, true);
    assert.deepEqual((await index.selectedRule(page.session, rule.id))?.wording, { state: 'unavailable', reason: 'recorded-declaration-conflict' });
  } finally { await index.close(); }
}));

test('host-qualified current sessions keep equal-text global and project declarations separate', () => fixture(async (root, writer) => {
  const digest = 'a'.repeat(64);
  const sources = (['global', 'project'] as const).map(role => {
    const source = `/synthetic/${role}/TENET.md`;
    return { role, source, target: source, digest, bytes: 1, rules: [{ id: `${role}:${digest}:1`, line: 1,
      text: 'Identical synthetic wording.', enforcement: 'BLOCK' as const, origin: { role, source, target: source, digest, line: 1 } }] };
  });
  const candidates = sources.map(source => ({ role: source.role, source: source.source, selection: 'local' as const, presence: 'present' as const }));
  const policy = { contractVersion: 'policy-sources-v1' as const, available: true as const, candidates, sources,
    combinedDigest: combinedPolicyDigest(candidates, sources), bytes: 2, rules: sources.flatMap(source => source.rules) };
  for (const host of ['pi', 'other-host']) {
    writer.bind({ host, contextId: 'main', sessionId: 'same-session', invocationId: 'same-invocation', callId: 'call', toolName: 'edit', cwd: '/synthetic', mode: 'observe' })
      ('begin', { policy, integrity: policyIntegrity(policy) });
  }
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await index.refresh(); const sessions = index.sessions({ limit: 1 });
    assert.equal(sessions.items.length, 1);
    const next = index.sessions({ cursor: sessions.next! });
    assert.equal(next.items.length, 1);
    assert.equal(new Set([...sessions.items, ...next.items].map(row => row.id)).size, 2);
    assert.deepEqual([...sessions.items, ...next.items].map(row => row.host).sort(), ['other-host', 'pi']);
    for (const session of [...sessions.items, ...next.items]) {
      const page = index.sessionRules(session.id);
      assert.deepEqual(page.inventory, { state: 'known', rules: 3, unchecked: 3 });
      assert.equal(page.status, 'unchecked');
      const declarations = page.items.filter(row => !row.builtin);
      assert.deepEqual(declarations.map(row => row.origin?.role).sort(), ['global', 'project']);
      assert.equal(new Set(declarations.map(row => row.id)).size, 2);
      assert.deepEqual(declarations.map(row => row.preview), ['Identical synthetic wording.', 'Identical synthetic wording.']);
      assert.equal(page.items.find(row => row.builtin)?.declarationId, 'builtin:policy-integrity');
      assert.equal(index.ruleChecks(session.id, declarations[0]!.id).items.length, 0);
    }
    assert.throws(() => index.sessions({ project: '/other', cursor: sessions.next! }), /invalid-page/);
  } finally { await index.close(); }
}));

test('explicitly not submitted is not an attempt and absent wording is never invented', () => fixture(async (root, writer) => {
  const begin = ruleRecording().begin; delete begin.integrity.text;
  writeRuleRecording(writer, 's', 'i', { begin, validation: { valid: false, request: 'not-submitted', reason: 'policy-unavailable' } });
  await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await index.refresh(); const page = index.sessionRules(sessionKey('s'));
    assert.equal(page.status, 'unchecked');
    assert.deepEqual(page.inventory, { state: 'known', rules: 2, unchecked: 2 });
    const builtin = page.items.find(row => row.builtin)!;
    assert.equal(builtin.checks, 0);
    assert.deepEqual((await index.selectedRule(page.session, builtin.id))?.wording, { state: 'unavailable', reason: 'recorded-wording-unavailable' });
  } finally { await index.close(); }
}));

test('selected wording uses the existing detail stage cap without hiding session findings', () => fixture(async (root, writer) => {
  const sink = writeRuleRecording(writer, 's', 'i', ruleRecording({ outcome: 'FAIL' }));
  for (let n = 0; n < 65; n++) { sink('begin', ruleRecording().begin); if (n % 8 === 0) await writer.settle(); }
  await writer.complete(); let reads = 0;
  const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
  try {
    await index.refresh(); const page = index.sessionRules(sessionKey('s'));
    assert.equal(page.status, 'violation');
    const rule = page.items.find(row => !row.builtin)!; const before = reads;
    assert.deepEqual((await index.selectedRule(page.session, rule.id))?.wording, { state: 'unavailable', reason: 'source-unavailable-or-changed' });
    assert.equal(reads - before, 64);
    assert.equal(index.sessionRules(page.session).status, 'violation');
  } finally { await index.close(); }
}));

test('oversized check labels are omitted explicitly and empty policy identity remains unknown', () => fixture(async (root, writer) => {
  const data = ruleRecording(); data.begin.policy.digest = '';
  writeRuleRecording(writer, 's', 'i'.repeat(300), data); await writer.complete(); const index = new ArchiveIndex(root);
  try {
    await index.refresh(); const page = index.sessionRules(sessionKey('s'));
    assert.equal(page.status, 'unclear'); assert.equal(page.inventory.state, 'unknown');
    const rule = page.items.find(row => !row.builtin)!;
    assert.equal(rule.policyIdentity, null);
    const check = index.ruleChecks(page.session, rule.id).items[0]!;
    assert.deepEqual({ callId: check.callId, omitted: check.callIdOmitted, trusted: check.trusted, outcome: check.outcome },
      { callId: null, omitted: true, trusted: true, outcome: 'PASS' });
    assert.equal(check.invocation.length, 64);
  } finally { await index.close(); }
}));

for (const defect of ['duplicate-after-cap', 'contradictory-diagnostics'] as const) {
  test(`recorded gate uncertainty cannot disappear through ${defect}`, () => fixture(async (root, writer) => {
    const data = ruleRecording();
    if (defect === 'duplicate-after-cap') data.decision.contributions.push(...Array.from({ length: 70 }, (_, n) => ({ ruleId: `other${n}`, gates: [] })), { ruleId: 'r', gates: ['outcome-unknown'] });
    else data.decision.diagnostics = [{ ruleId: 'r', gates: ['outcome-unknown'] }, { ruleId: 'historical-integrity', gates: [] }];
    writeRuleRecording(writer, 's', 'i', data); await writer.complete(); const index = new ArchiveIndex(root);
    try {
      await index.refresh(); const page = index.sessionRules(sessionKey('s'));
      assert.equal(page.status, 'unclear');
      const rule = page.items.find(row => !row.builtin)!;
      const check = index.ruleChecks(page.session, rule.id).items[0]!;
      assert.deepEqual({ status: check.status, outcome: check.outcome, trusted: check.trusted, gates: check.gates },
        { status: 'unclear', outcome: 'PASS', trusted: true, gates: defect === 'duplicate-after-cap' ? null : ['outcome-unknown'] });
    } finally { await index.close(); }
  }));
}
