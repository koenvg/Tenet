import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../src/decision/decide.js';
import { createJevJudge } from '../src/decision/jev.js';
import { captureAction } from '../src/decision/evidence.js';
import { answer, policy, sdkAnswers } from './helpers.js';

const base = { policy, cwd: '/project', action: captureAction({ sessionId: 's', callId: 'c', toolName: 'read', arguments: {} }) };
const cases: [string, (r: any) => void][] = [
  ['response-shape', r => { r.probabilities = []; }],
  ['labels', r => { delete r.probabilities.PASS; r.probabilities.secret = 0.97; }],
  ['labels', r => { r.choice = 'secret'; }],
  ['score-range', r => { r.probabilities.PASS = -0.1; }],
  ['score-range', r => { r.probabilities.PASS = 'secret'; }],
  ['unit-sum', r => { r.probabilities = { PASS: 0.89, FAIL: 0.1, UNKNOWN: 0, APPROVAL_REQUIRED: 0, NOT_APPLICABLE: 0 }; }],
  ['selected-choice', r => { r.choice = 'FAIL'; }],
];
for (const provider of ['injected', 'sdk']) for (const [issue, mutate] of cases) {
  test(`${provider} rejects ${issue} with a bounded diagnostic`, async () => {
    const raw = answer(); mutate(raw.rules[0]!.outcome);
    const judge = provider === 'injected' ? async () => raw : createJevJudge({ apiKey: 'offline', fetch: async () =>
      Response.json({ model: 'offline', answers: sdkAnswers(raw), prose: 'secret' }) });
    const result = await decide({ ...base, judge });
    assert.equal(result.decision, 'BLOCK');
    assert.equal(result.reason, 'invalid-response');
    assert.equal((result as any).validationIssue, issue);
    assert.equal(result.assessment, null);
    assert.deepEqual(result.diagnostics, []);
    assert.ok(!JSON.stringify(result).includes('secret'));
  });
}
test('nonfinite injected scores are rejected, never normalized', async () => {
  for (const score of [NaN, Infinity, 1.1]) {
    const raw = answer(); raw.rules[0]!.outcome.probabilities.PASS = score;
    const result = await decide({ ...base, judge: async () => raw });
    assert.equal((result as any).validationIssue, 'score-range');
  }
});

test('strict precision rejection cannot clear other blockers or promote thresholds', async () => {
  for (const outcome of ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'] as const) for (const p of [0.89, 0.9, 0.91]) {
    const raw = answer(policy, outcome);
    raw.rules[0]!.evidence.probabilities = { SUFFICIENT: p, INSUFFICIENT: 0.99 - p };
    const original = structuredClone(raw);
    const result = await decide({ ...base, judge: async () => raw });
    assert.equal(result.reason, 'invalid-response');
    assert.equal(result.validationIssue, 'unit-sum');
    assert.equal(result.decision, 'BLOCK');
    assert.deepEqual(raw, original);
  }
});

test('SDK validates evidence and fact distributions and preserves raw response separately', async () => {
  for (const key of ['rule_0_evidence', 'rule_0_facts']) {
    const answers = sdkAnswers(answer());
    const first = Object.keys(answers[key].probabilities)[0]!;
    answers[key].probabilities[first] -= 0.01;
    const stages: { stage: string; data: any }[] = [];
    const result = await decide({ ...base, recording: (stage, data) => { stages.push({ stage, data }); },
      judge: createJevJudge({ apiKey: 'offline', fetch: async () => Response.json({ model: 'offline', answers, prose: 'private-prose' }) }) });
    assert.equal(result.validationIssue, 'unit-sum');
    const validation = stages.find(r => r.stage === 'validation')!.data;
    assert.equal(validation.validationIssue, 'unit-sum');
    assert.ok(!JSON.stringify(validation).includes('private-prose'));
    assert.ok(JSON.stringify(stages.find(r => r.stage === 'response')).includes(String(answers[key].probabilities[first])));
  }
});
