import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectSummaryDecision } from '../src/inspector/bb-summary.js';
import { projectThreadFinding } from '../src/inspector/bb-findings.js';
import { recordedInputs } from '../src/recording/scoped.js';
import { captureScopedPlan } from '../src/recording/scoped-capture.js';
import { scopedFixture } from './scoped-recording-fixture.js';
import { selectedPassRecords, selectedRecords } from './selected-summary-fixture.js';

const stage = (rows: ReturnType<typeof selectedRecords>, name: string): Record<string, any> => rows.find(r => r.stage === name)!.data;
test('selected summary preserves one recorded scalar, whitespace and UTF-8 bounds without private bags', () => {
  const rows = selectedRecords(), before = JSON.stringify(rows);
  assert.deepEqual(projectSummaryDecision(rows).recordedAction, { field: 'command', text: 'printf "a  b"\n  echo 雪', truncated: false });
  const args = stage(rows, 'request').payload.state.action.arguments;
  for (const field of ['command', 'path', 'file_path']) {
    stage(rows, 'request').payload.state.action.arguments = { [field]: '雪'.repeat(1365) + '😀tail' };
    assert.deepEqual(projectSummaryDecision(rows).recordedAction, { field, text: '雪'.repeat(1365), truncated: true });
    stage(rows, 'request').payload.state.action.arguments = { [field]: '雪'.repeat(1365) + 'a' };
    assert.equal(projectSummaryDecision(rows).recordedAction?.truncated, false);
  }
  stage(rows, 'request').payload.state.action.arguments = args;
  for (const privateText of ['PRIVATE-BEGIN', 'PRIVATE-SECOND-FIELD', 'PRIVATE-TOKEN', 'PRIVATE-HISTORY', 'PRIVATE-QUESTION', 'PRIVATE-RESPONSE', 'PRIVATE-CWD']) assert.ok(!JSON.stringify(projectSummaryDecision(rows)).includes(privateText));
  assert.ok(!JSON.stringify(projectThreadFinding(rows, 'selected', 'thr_selectedfixture')).includes('printf'));
  assert.equal(JSON.stringify(rows), before);
});

test('missing, unsupported and nonscalar request actions are explicitly unavailable and never use begin', () => {
  const rows = selectedRecords();
  stage(rows, 'begin').action = { arguments: { command: 'not-requested' } };
  assert.equal(projectSummaryDecision(rows.filter(r => r.stage !== 'request')).recordedAction, null);
  for (const argumentsValue of ['raw-arguments', { command: ['not-a-scalar'] }, { other: 'not-allowlisted' }]) {
    stage(rows, 'request').payload.state.action.arguments = argumentsValue;
    assert.equal(projectSummaryDecision(rows).recordedAction, null);
  }
  stage(rows, 'request').inputVersion = 'unsupported';
  stage(rows, 'request').questionVersion = 'policy-rules-v9-scoped';
  assert.equal(projectSummaryDecision(rows).recordedAction, null);
});

test('scoped recorded action works with nonleading ordinary and policy-protection-only scopes', async () => {
  for (const protectionOnly of [false, true]) {
    const { request, plan, questions } = structuredClone(await scopedFixture());
    if (protectionOnly) {
      (request.policy as any).rules = [];
      plan.groups = plan.groups.filter(g => g.kind === 'policy-protection');
      plan.entries = plan.entries.slice(-1).map(entry => ({ ...entry, outcomeKey: 'rule_0_outcome', evidenceKey: 'rule_0_evidence', factsKey: 'rule_0_facts' }));
      plan.groups[0]!.questionKeys = ['rule_0_outcome', 'rule_0_evidence'];
      plan.questionScopes = Object.fromEntries(plan.groups[0]!.questionKeys.map(k => [k, plan.groups[0]!.id]));
      const oldQuestions = Object.values(questions);
      Object.keys(questions).forEach(k => delete questions[k]);
      questions.rule_0_outcome = oldQuestions[0]!; questions.rule_0_evidence = oldQuestions[1]!;
    } else plan.groups.reverse();
    for (const group of plan.groups) {
      (group.state as any).proposedToolCall.arguments = { file_path: ' recorded/雪 file ' };
      group.stateBytes = new TextEncoder().encode(JSON.stringify(group.state)).length;
    }
    plan.totalStateBytes = plan.groups.reduce((n, g) => n + g.stateBytes, 0);
    const rows = selectedRecords();
    captureScopedPlan((name, data) => { if (name === 'request') rows.find(r => r.stage === name)!.data = data; }, request, plan, questions, { provider: 'typesafe', model: 'offline' });
    assert.equal(recordedInputs(stage(rows, 'request')).layout, 'scoped');
    assert.deepEqual(projectSummaryDecision(rows).recordedAction, { field: 'file_path', text: ' recorded/雪 file ', truncated: false });
  }
});

test('reported FAILs are whole-call, bounded, page-stable and distinct from WARN and confidence gates', () => {
  const rows = selectedRecords(20), policy = stage(rows, 'request').policy;
  policy.rules[0].enforcement = 'WARN';
  stage(rows, 'decision').contributions[0].gates = ['rule-fail', 'evidence-insufficient'];
  stage(rows, 'assessment').assessment.rules[1].outcome.choice = 'PASS';
  stage(rows, 'decision').contributions[1].gates = ['outcome-confidence-below-threshold'];
  const first = projectSummaryDecision(rows), second = projectSummaryDecision(rows, 16);
  assert.deepEqual(first.reportedViolations, second.reportedViolations);
  assert.equal(first.reportedViolations?.total, 19);
  assert.equal(first.reportedViolations?.items.length, 16);
  assert.deepEqual(first.reportedViolations?.items[0], { id: 'r0', text: 'Recorded rule 0.', textStatus: 'recorded', omittedTextChars: 0, enforcement: 'WARN', uncertain: true });
  assert.equal(first.reportedViolations?.items.at(-1)?.id, 'r16');
  stage(rows, 'assessment').assessment.rules.forEach((r: any, i: number) => { r.outcome.choice = i === 19 ? 'FAIL' : 'PASS'; });
  stage(rows, 'decision').contributions[19].gates = undefined;
  assert.equal(projectSummaryDecision(rows).reportedViolations?.items[0]?.id, 'r19');
  assert.equal(projectSummaryDecision(rows).reportedViolations?.items[0]?.uncertain, true);
  stage(rows, 'decision').diagnostics = [{ ruleId: 'r19', gates: ['rule-fail'] }];
  stage(rows, 'decision').contributions = [];
  assert.equal(projectSummaryDecision(rows).reportedViolations?.items[0]?.uncertain, true);
});

test('compact FAIL attribution uses submitted snapshots while technical browsing retains begin fallback', () => {
  const rows = selectedRecords();
  stage(rows, 'begin').policy = { digest: 'a'.repeat(64), rules: [{ id: 'r0', text: 'oldtext', enforcement: 'BLOCK', line: 1 }] };
  delete stage(rows, 'request').policy;
  const missing = projectSummaryDecision(rows);
  assert.deepEqual(missing.reportedViolations, { assessment: 'validated', uncertain: false, items: [], total: 1, missingRuleSnapshots: 1 });
  assert.equal(missing.rules[0]?.text, 'oldtext');
  assert.equal(missing.metadata?.policyDigest, 'a'.repeat(64));
  assert.equal(projectSummaryDecision(rows.filter(r => r.stage !== 'request')).reportedViolations?.items[0]?.text, 'oldtext');
  const emptyRequest = structuredClone(rows);
  emptyRequest.find(r => r.stage === 'request')!.data = {};
  assert.deepEqual(projectSummaryDecision(emptyRequest).reportedViolations, { assessment: 'validated', uncertain: false, items: [], total: 1, missingRuleSnapshots: 1 });
  stage(rows, 'request').policy = { digest: 'b'.repeat(64), rules: [{ id: 'r0', text: 'submittedtext', enforcement: 'BLOCK', line: 2 }] };
  const submitted = projectSummaryDecision(rows);
  assert.equal(submitted.reportedViolations?.items[0]?.text, 'submittedtext');
  assert.equal(submitted.reportedViolations?.missingRuleSnapshots, 0);
  assert.equal(submitted.rules[0]?.text, 'submittedtext');
  assert.equal(submitted.metadata?.policyDigest, 'b'.repeat(64));
  assert.deepEqual(projectSummaryDecision(rows, 16).reportedViolations, submitted.reportedViolations);
  assert.deepEqual(projectSummaryDecision(rows, 16).metadata, submitted.metadata);
  assert.equal(submitted.decision, missing.decision);
  assert.deepEqual(submitted.categories, missing.categories);
});

test('whole-call uncertainty includes selected gates beyond both rule page and finding cap', () => {
  for (const gate of ['outcome-confidence-below-threshold', null]) {
    const rows = selectedPassRecords(gate);
    const first = projectSummaryDecision(rows), last = projectSummaryDecision(rows, 16);
    assert.equal(first.noRulesClassifiedViolated, true);
    assert.deepEqual(first.categories, []);
    assert.deepEqual(first.reportedViolations, { assessment: 'validated', uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 });
    assert.deepEqual(last.reportedViolations, first.reportedViolations);
    stage(rows, 'decision').contributions[19].gates = [];
    assert.deepEqual(projectSummaryDecision(rows).reportedViolations, { assessment: 'validated', uncertain: false, items: [], total: 0, missingRuleSnapshots: 0 });
    delete stage(rows, 'request').policy;
    stage(rows, 'decision').contributions[19].gates = ['outcome-confidence-below-threshold'];
    assert.equal(projectSummaryDecision(rows).reportedViolations?.uncertain, true);
  }
});

test('completed folds without validation remain neutral; missing and truncated rule snapshots stay explicit', () => {
  const rows = selectedRecords();
  const absent = projectSummaryDecision(rows.filter(r => r.stage !== 'validation'));
  assert.equal(absent.evaluatorState?.status, 'completed');
  assert.deepEqual(absent.reportedViolations, { assessment: 'unavailable', uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 });
  stage(rows, 'validation').valid = false;
  assert.equal(projectSummaryDecision(rows).reportedViolations?.assessment, 'unavailable');
  stage(rows, 'validation').valid = true;
  stage(rows, 'assessment').validationIssue = 'shape';
  assert.equal(projectSummaryDecision(rows).reportedViolations?.assessment, 'unavailable');
  delete stage(rows, 'assessment').validationIssue;
  stage(rows, 'request').policy.rules[0].text = 'x'.repeat(3000);
  let result = projectSummaryDecision(rows).reportedViolations!;
  assert.equal(result.items[0]?.textStatus, 'truncated'); assert.equal(result.items[0]?.omittedTextChars, 962);
  delete stage(rows, 'request').policy.rules[0].text;
  result = projectSummaryDecision(rows).reportedViolations!;
  assert.equal(result.items[0]?.textStatus, 'missing');
  stage(rows, 'assessment').assessment.rules.push({ ruleId: 'no-snapshot', outcome: { choice: 'FAIL' } });
  result = projectSummaryDecision(rows).reportedViolations!;
  assert.equal(result.missingRuleSnapshots, 1); assert.equal(result.total, 2);
});
