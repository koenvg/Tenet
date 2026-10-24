import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { sessionKey } from '../src/recording/archive.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { distribution, refreshRules, ruleRecording, writeRuleRecording } from './session-rules-fixture.js';

type Recording = ReturnType<typeof ruleRecording>;
type Status = 'clear' | 'unclear' | 'violation';
async function inspect(data: Recording, run: (index: ArchiveIndex, session: string, root: string) => void | Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-198-rules-')));
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  let index: ArchiveIndex | undefined;
  try {
    writeRuleRecording(writer, 's', 'i', data); await writer.complete();
    index = new ArchiveIndex(root); await refreshRules(index);
    await run(index, sessionKey('s'), root);
    assert.deepEqual(index.captureHealth(), []);
  } finally { await index?.close(); await writer.close(); await rm(root, { recursive: true, force: true }); }
}

const diagnosticCases: { name: string; mutate: (data: Recording) => void; gates: string[] | null; uncertain?: boolean }[] = [
  { name: 'absent diagnostics', mutate: () => {}, gates: [] },
  { name: 'empty sparse diagnostics', mutate: d => { d.decision.diagnostics = []; }, gates: [] },
  { name: 'sparse diagnostics only for integrity', mutate: d => { d.decision.diagnostics = [{ ruleId: 'historical-integrity', gates: [] }]; }, gates: [] },
  { name: 'diagnostics without contributions', mutate: d => { d.decision.diagnostics = d.decision.contributions; delete d.decision.contributions; }, gates: [] },
  { name: 'both gate lists absent', mutate: d => { delete d.decision.contributions; }, gates: null },
  { name: 'missing gates in diagnostic', mutate: d => { d.decision.diagnostics = [{ ruleId: 'r' }]; }, gates: null },
  { name: 'malformed diagnostic list', mutate: d => { d.decision.diagnostics = {}; }, gates: null },
  { name: 'null diagnostic list', mutate: d => { d.decision.diagnostics = null; }, gates: null },
  { name: 'malformed contribution list', mutate: d => { d.decision.diagnostics = d.decision.contributions; d.decision.contributions = {}; }, gates: null },
  { name: 'duplicate diagnostics', mutate: d => { d.decision.diagnostics = [{ ruleId: 'r', gates: [] }, { ruleId: 'r', gates: [] }]; }, gates: null },
  { name: 'duplicate diagnostic beyond cap', mutate: d => { d.decision.diagnostics = [{ ruleId: 'r', gates: [] }, ...Array.from({ length: 70 }, (_, n) => ({ ruleId: `foreign-${n}`, gates: [] })), { ruleId: 'r', gates: [] }]; }, gates: null },
  { name: 'duplicate contribution beyond cap', mutate: d => { d.decision.contributions.push(...Array.from({ length: 70 }, (_, n) => ({ ruleId: `foreign-${n}`, gates: [] })), { ruleId: 'r', gates: [] }); }, gates: null },
  { name: 'contradictory diagnostic', mutate: d => { d.decision.diagnostics = [{ ruleId: 'r', gates: ['evidence-confidence-below-threshold'] }]; }, gates: ['evidence-confidence-below-threshold'], uncertain: true },
];
for (const outcome of ['PASS', 'FAIL']) for (const scenario of diagnosticCases) {
  test(`TENET-198 ${outcome} retains ${scenario.name}`, async () => {
    const data = ruleRecording({ outcome }); scenario.mutate(data);
    const status: Status = scenario.gates === null || scenario.uncertain ? 'unclear' : outcome === 'FAIL' ? 'violation' : 'clear';
    await inspect(data, (index, session) => {
      const page = index.sessionRules(session), rule = page.items.find(row => !row.builtin)!;
      const check = index.ruleChecks(session, rule.id).items[0]!;
      assert.deepEqual({ status: check.status, outcome: check.outcome, trusted: check.trusted, gates: check.gates },
        { status, outcome, trusted: true, gates: scenario.gates });
      assert.equal(rule.status, status); assert.equal(page.status, status);
      assert.equal(index.sessions().items[0]!.status, status);
    });
  });
}

for (const gate of ['rule-fail', 'outcome-unknown', 'outcome-confidence-below-threshold', 'evidence-insufficient', 'evidence-confidence-below-threshold', 'applicability-unresolved', 'future-unknown-gate']) {
  test(`TENET-198 FAIL preserves recorded ${gate}`, async () => {
    const data = ruleRecording({ outcome: 'FAIL' });
    const gates = gate === 'rule-fail' ? ['rule-fail'] : ['rule-fail', gate];
    data.decision.contributions[0].gates = gates; data.decision.diagnostics = [{ ruleId: 'r', gates }];
    await inspect(data, (index, session) => {
      const page = index.sessionRules(session), rule = page.items.find(row => !row.builtin)!;
      const check = index.ruleChecks(session, rule.id).items[0]!;
      const status = gate === 'rule-fail' ? 'violation' : 'unclear';
      assert.deepEqual({ status: check.status, outcome: check.outcome, gates: check.gates, trusted: check.trusted },
        { status, outcome: 'FAIL', gates, trusted: true });
      assert.equal(page.status, status); assert.equal(index.sessions().items[0]!.status, status);
    });
  });
}

for (const builtin of [false, true]) for (const evidence of ['SUFFICIENT', 'INSUFFICIENT']) {
  test(`TENET-198 ${builtin ? 'integrity' : 'user'} FAIL needs ${evidence} recorded evidence`, async () => {
    const data = ruleRecording(), selected = data.assessment.assessment.rules[builtin ? 1 : 0];
    selected.outcome = distribution('FAIL', ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED']);
    selected.evidence = distribution(evidence, ['SUFFICIENT', 'INSUFFICIENT']);
    data.decision.contributions[builtin ? 1 : 0].gates = ['rule-fail'];
    data.decision.diagnostics = [];
    await inspect(data, (index, session) => {
      const page = index.sessionRules(session), rule = page.items.find(row => row.builtin === builtin)!;
      const check = index.ruleChecks(session, rule.id).items[0]!;
      const status = evidence === 'SUFFICIENT' ? 'violation' : 'unclear';
      assert.deepEqual({ status: check.status, outcome: check.outcome, gates: check.gates, trusted: check.trusted },
        { status, outcome: 'FAIL', gates: ['rule-fail'], trusted: true });
      assert.equal(page.status, status); assert.equal(index.sessions().items[0]!.status, status);
    });
  });
}

for (const [profile, question] of [['legacy', undefined], ['legacy', 'policy-rules-v5-resolved-action'],
  ...['policy-rules-v6-applicability', 'policy-rules-v7-evidence-selection', 'policy-rules-v7-ordinary-evidence', 'policy-rules-v8-source-set'].map(question => ['applicability-v1', question])] as const) {
  for (const gated of [false, true]) test(`TENET-198 historical ${profile}/${question} retains gates ${gated}`, async () => {
    const data = ruleRecording({ outcome: 'FAIL', profile, question });
    data.assessment.assessment.rules[0].outcome.probabilities = { PASS: .4, FAIL: .6, UNKNOWN: 0, APPROVAL_REQUIRED: 0,
      ...(profile === 'applicability-v1' ? { NOT_APPLICABLE: 0 } : {}) };
    const gates = gated ? ['rule-fail', 'outcome-confidence-below-threshold'] : [];
    data.decision.contributions[0].gates = gates; data.decision.diagnostics = [];
    data.decision.config = { effectThreshold: gated ? 0 : 1, evidenceThreshold: 1 };
    await inspect(data, (index, session) => {
      const page = index.sessionRules(session), rule = page.items.find(row => !row.builtin)!;
      const check = index.ruleChecks(session, rule.id).items[0]!;
      const status = gated ? 'unclear' : 'violation';
      assert.deepEqual({ status: check.status, outcome: check.outcome, gates: check.gates, trusted: check.trusted,
        profile: check.profile, question: check.questionVersion, input: check.inputVersion },
      { status, outcome: 'FAIL', gates, trusted: true, profile, question: question ?? null, input: null });
      assert.equal(page.status, status);
    });
  });
}

const overflowCases: { name: string; status: Status; mutate: (d: Recording) => void }[] = [
  { name: 'tail supported FAIL with explicit empty gates', status: 'violation', mutate: () => {} },
  { name: 'tail supported FAIL with rule-fail', status: 'violation', mutate: d => { d.decision.contributions[129].gates = ['rule-fail']; } },
  { name: 'tail insufficient FAIL', status: 'unclear', mutate: d => { d.assessment.assessment.rules[129].evidence = distribution('INSUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']); } },
  { name: 'tail confidence-gated FAIL', status: 'unclear', mutate: d => { d.decision.contributions[129].gates = ['rule-fail', 'outcome-confidence-below-threshold']; } },
  { name: 'tail unknown-gated FAIL', status: 'unclear', mutate: d => { d.decision.contributions[129].gates = ['future-unknown-gate']; } },
  { name: 'tail FAIL missing gates', status: 'unclear', mutate: d => { d.decision.contributions.splice(129, 1); } },
  { name: 'tail FAIL duplicate contribution', status: 'unclear', mutate: d => { d.decision.contributions.push({ ruleId: 'r129', gates: [] }); } },
  { name: 'tail FAIL contradictory diagnostic', status: 'unclear', mutate: d => { d.decision.diagnostics = [{ ruleId: 'r129', gates: ['evidence-insufficient'] }]; } },
  { name: 'tail FAIL duplicate diagnostic', status: 'unclear', mutate: d => { d.decision.diagnostics = [{ ruleId: 'r129', gates: [] }, { ruleId: 'r129', gates: [] }]; } },
  { name: 'retained supported FAIL and uncertain tail FAIL', status: 'violation', mutate: d => { d.assessment.assessment.rules[0].outcome = distribution('FAIL', ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED']); d.assessment.assessment.rules[129].evidence = distribution('INSUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']); } },
  { name: 'uncertain retained FAIL and supported tail FAIL', status: 'violation', mutate: d => { d.assessment.assessment.rules[0].outcome = distribution('FAIL', ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED']); d.decision.contributions[0].gates = ['outcome-confidence-below-threshold']; } },
  { name: 'uncertain tail FAIL and separate supported tail FAIL', status: 'violation', mutate: d => { d.assessment.assessment.rules[128].outcome = distribution('FAIL', ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED']); d.decision.contributions[128].gates = ['outcome-confidence-below-threshold']; } },
  { name: 'malformed tail assessment', status: 'unclear', mutate: d => { d.assessment.assessment.rules[129].evidence = null; } },
  { name: 'uncertain failures exhaust retained candidates', status: 'unclear', mutate: d => { for (let n = 0; n < 65; n++) { d.assessment.assessment.rules[n].outcome = distribution('FAIL', ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED']); d.decision.contributions[n].gates = ['outcome-confidence-below-threshold']; } } },
  { name: 'uncertainty exhausts retained gates before tail FAIL', status: 'unclear', mutate: d => { for (let n = 0; n < 66; n++) d.decision.contributions[n].gates = ['outcome-confidence-below-threshold']; } },
];
for (const scenario of overflowCases) test(`TENET-198 overflow keeps ${scenario.name}`, async () => {
  const data = ruleRecording({ rules: 130 });
  data.assessment.assessment.rules[129].outcome = distribution('FAIL', ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED']);
  scenario.mutate(data);
  await inspect(data, (index, session) => {
    const page = index.sessionRules(session, { limit: 100 });
    assert.equal(page.status, scenario.status); assert.equal(index.sessions().items[0]!.status, scenario.status);
    assert.equal(page.items.length, 65); assert.equal(page.inventory.state, 'unknown');
    assert.equal(page.ruleCoverage.omittedRules, 66);
    assert.equal(page.ruleCoverage.reasons.includes('rule-facts-overflow'), true);
  });
});

test('TENET-198 aggregate retains supported violation over separate uncertain FAIL', async () => {
  const data = ruleRecording({ outcome: 'FAIL' }); data.decision.contributions[0].gates = ['evidence-insufficient'];
  await inspect(data, async (index, session, root) => {
    assert.equal(index.sessionRules(session).status, 'unclear');
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    try { writeRuleRecording(writer, 's', 'supported', ruleRecording({ outcome: 'FAIL' })); await writer.complete(); }
    finally { await writer.close(); }
    await refreshRules(index);
    const page = index.sessionRules(session), rule = page.items.find(row => !row.builtin)!;
    assert.equal(page.status, 'violation'); assert.equal(index.sessions().items[0]!.status, 'violation');
    assert.deepEqual(index.ruleChecks(session, rule.id).items.map(check => check.status).sort(), ['unclear', 'violation']);
  });
});
