import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type JudgeRequest } from 'tenet';
import { answer } from './helpers.js';
import frozen from './fixtures/judge-prompts/v8-read-00.json' with { type: 'json' };
import { historicalQuestions } from '../eval/evidence-selection-history.js';
import { scriptedApplicabilityComparison } from '../eval/applicability-replay.js';
import { serializedBytes } from '../src/decision/history-selection.js';
import type { PolicySet } from '../src/decision/contracts.js';
import { boundHistoricalEvidence } from '../eval/evidence-selection-history.js';
import { historicalAssessment } from '../eval/historical-assessment.js';

test('public SDK host name cannot change live or recovered previous-call encoding', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-host-name-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; Never create Git commits.');
  const requests: JudgeRequest[] = [];
  const guard = createGuard({ host: 'host', judge: async request => { requests.push(request); return answer(request.policy); },
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control.json') });
  try {
    const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    const call = async (callId: string, input: Record<string, unknown>) => {
      const current = { sessionId: 'one', contextId: 'main', callId, toolName: 'read', input };
      const result = await session.beforeTool({ callId, toolName: 'read', input, current: () => current });
      assert.equal(result.assessment.status, 'completed');
    };
    await call('first', { path: '/synthetic/FIRST.md' });
    await call('second', { path: '/synthetic/SECOND.md' });
    const ordinary = requests[1]!.judgeScopes!.groups.find(group => group.kind === 'ordinary')!;
    assert.deepEqual(ordinary.state.previousToolCall, { toolName: 'read', arguments: { path: '/synthetic/FIRST.md' } });
    // A recovered argument named arguments is literal data, not a live Action envelope.
    session.setHistory([{ kind: 'tool-call', callId: 'recovered', toolName: 'read', data: { arguments: 'literal', path: '/synthetic/RECOVERED.md' } }]);
    await call('third', { path: '/synthetic/THIRD.md' });
    assert.deepEqual(requests[2]!.judgeScopes!.groups.find(group => group.kind === 'ordinary')!.state.previousToolCall,
      { toolName: 'read', arguments: { arguments: 'literal', path: '/synthetic/RECOVERED.md' } });
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});

test('frozen historical templates reference each distinct user rule without changing the fixture', () => {
  const policy = { ...frozen.request.policy, rules: [frozen.request.policy.rules[0]!,
    { ...frozen.request.policy.rules[0]!, id: 'distinct-second-rule', text: 'Never send email.' }] } as PolicySet;
  const questions = historicalQuestions(policy);
  for (const kind of ['outcome', 'evidence', 'facts']) {
    assert.ok(questions[`rule_0_${kind}`]!.instructions.includes('state.policy.rules[0].text'));
    assert.ok(questions[`rule_1_${kind}`]!.instructions.includes('state.policy.rules[1].text'));
    assert.ok(!questions[`rule_1_${kind}`]!.instructions.includes('state.policy.rules[0].text'));
  }
  assert.ok(frozen.questions.rule_0_outcome.instructions.includes('state.policy.rules[0].text'));
});

test('historical replay metadata describes its actual admitted shared payload', async () => {
  const report = await scriptedApplicabilityComparison();
  for (const row of report.rows.filter(row => row.submittedState !== null)) {
    assert.equal(row.questionVersion, 'policy-rules-v8-source-set');
    assert.equal(row.evidenceContext!.version, 'evidence-context-v1');
    assert.equal(row.evidenceContext!.selectionVersion, 'bounded-history-v2');
    const state = row.submittedState as { trajectory: unknown };
    assert.equal(row.evidenceContext!.history!.retainedBytes, serializedBytes(state.trajectory));
    assert.equal('scopes' in row.evidenceContext!, false);
  }
});


test('historical admission failure stops scripted assessment and successful admission uses common validation', () => {
  const source = { ...frozen.request, deadlineMs: 2500 } as unknown as JudgeRequest;
  const prepared = boundHistoricalEvidence(source);
  assert.ok(prepared);
  let calls = 0;
  const scripted = (request: JudgeRequest) => { calls++; assert.equal(request, prepared); return answer(request.policy); };
  const result = historicalAssessment(source.policy, prepared, scripted);
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.evidenceContext, prepared.evidenceContext);
  assert.equal(calls, 1);
  const rejected = boundHistoricalEvidence(source, { recentEvents: 12, maxBytes: 1 });
  assert.equal(rejected, null);
  const unavailable = historicalAssessment(source.policy, rejected, scripted);
  assert.equal(calls, 1);
  assert.equal(unavailable.reason, 'insufficient-evidence');
  assert.equal(unavailable.assessment, null);
  assert.equal(unavailable.evidenceContext.preparation, 'unavailable');
  const invalid = historicalAssessment(source.policy, prepared, request => {
    const value = answer(request.policy);
    value.rules[0]!.outcome.probabilities.PASS = 0.99;
    return value;
  });
  assert.equal(invalid.reason, 'invalid-response');
  assert.equal(invalid.assessment, null);
});
