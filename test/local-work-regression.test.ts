import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { decide, DEFAULTS, QUESTION_VERSION } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { FIXTURES, FIXTURE_CWD, fixturePolicy, REPORTED_FIXTURES } from '../eval/generic-rule-fixtures.js';
import { runReplay } from '../eval/replay.js';
import { ruleAnswer, sdkAnswers } from './helpers.js';
import { reportedAssessment } from './reported-assessments.js';

for (const index of [0, 1] as const) {
  test(`recorded scores retain original block: ${REPORTED_FIXTURES[index].id}`, async () => {
    const fixture = REPORTED_FIXTURES[index];
    const policy = fixturePolicy(fixture);
    const action = captureAction({ ...fixture.input, sessionId: 'offline', callId: fixture.id });
    const result = await decide({ policy, action, cwd: FIXTURE_CWD, judge: async () => reportedAssessment(index) });
    assert.equal(result.decision, 'BLOCK');
    assert.equal(result.reason, index === 0 ? 'insufficient-evidence' : 'rule-failed');
    assert.deepEqual(result.ruleIds, index === 0 ? [policy.rules[1]!.id] : [policy.rules[1]!.id, 'builtin:policy-integrity']);
  });
}

// These are scripted contract regressions, NOT live semantic-accuracy measurements.
for (const fixture of Object.values(FIXTURES).flat()) {
  test(`offline generic-rule fixture: ${fixture.id}`, async () => {
    const policy = fixturePolicy(fixture);
    const original = structuredClone(fixture.input.arguments);
    const action = captureAction({ ...fixture.input, sessionId: 'offline', callId: fixture.id }, fixture.sensitiveFields);
    const outcomes = [...fixture.outcomes, fixture.integrity];
    let requests = 0;
    const judge = createSystemOneJudge({ baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', auth: { type: 'bearer', token: 'offline-transport-key' }, fetch: async (_url, init) => {
      requests++;
      const body = JSON.parse(init!.body as string);
      assert.deepEqual(body.state.proposedToolCall, { toolName: action.toolName, arguments: action.arguments });
      if ('thinkingTrace' in body.state) {
        assert.ok(policy.rules.some(r => r.text === body.state.rule));
        assert.deepEqual(Object.keys(body.state), ['rule', 'thinkingTrace', 'previousToolCall', 'proposedToolCall']);
      } else assert.ok(!('trajectory' in body.state) && !('previousToolCall' in body.state));
      const answers = sdkAnswers({ model: 'scripted-not-live', rules: outcomes.map((outcome, i) => ruleAnswer(i < policy.rules.length ? policy.rules[i]!.id : 'builtin:policy-integrity', outcome)) }, 1, body.questions);
      return Response.json({ model: 'scripted-not-live', answers });
    } });
    const result = await decide({ policy, action, cwd: FIXTURE_CWD, judge });
    assert.equal(result.decision, fixture.expectedDecision);
    assert.deepEqual(result.assessment?.rules.map(r => r.outcome.choice), outcomes);
    assert.equal(requests, 2 * policy.rules.length + 1); assert.deepEqual(fixture.input.arguments, original);
    if (fixture.sensitiveFields) { assert.ok(action.redactedFields > 0); assert.ok(!JSON.stringify(action).includes('/outside/x')); }
  });
}

test('generic questions have a distinct version; old live reports remain historical and unchanged', () => {
  assert.equal(QUESTION_VERSION, 'policy-rules-v9-scoped');
  assert.equal(DEFAULTS.effectThreshold, 0.90); assert.equal(DEFAULTS.evidenceThreshold, 0.90);
  for (const name of ['current-probe.json', 'candidate-probe.json', 'v3-probe.json', 'v3-holdout.json']) {
    const report = JSON.parse(readFileSync(new URL(`../eval/${name}`, import.meta.url), 'utf8'));
    assert.notEqual(report.questionVersion, QUESTION_VERSION);
    assert.equal(createHash('sha256').update(JSON.stringify(report.questions)).digest('hex'), report.questionDigest);
    assert.equal(report.rows.length, 6);
  }
});

test('diagnostic requires live opt-in and refuses historical question overrides before sending', () => {
  for (const [args, message] of [
    [[], /Live replay requires --live\. No requests sent\./],
    [['--live', '--questions-from=eval/v3-probe.json'], /incompatible.*No requests sent/],
    [['--live', '--set=local-work', '--output=unused.json', '--repetitions=0'], /repetitions between 1 and 20.*No requests sent/],
    [['--set=local-work', '--output=unused.json'], /Live replay requires --live\. No requests sent\./],
    [['--set=cross-domain', '--output=unused.json'], /Live replay requires --live\. No requests sent\./],
    [['--live', '--set=cross-domain', '--output=unused.json', '--repetitions=0'], /repetitions between 1 and 20.*No requests sent/],
  ] as const) {
    const result = spawnSync('bun', ['eval/local-work-replay.ts', ...args], { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: 'offline-test' } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, message);
  }
});

for (const [set, repetitions, assessments, budget] of [
  ['probe', 1, 6, 22],
  ['holdout', 1, 6, 18],
  ['local-work', 3, 21, 147],
] as const) {
  test(`current ${set} live instructions budget every scoped JEV submission`, async () => {
    let requests = 0;
    const report = await runReplay({ fixtures: FIXTURES[set], repetitions, judge: (input, signal, recording) => {
      const fixture = FIXTURES[set].find(f => input.action.callId?.startsWith(`${f.id}:`));
      assert.ok(fixture);
      const outcomes = [...fixture.outcomes, fixture.integrity];
      return createSystemOneJudge({ baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', auth: { type: 'bearer', token: 'offline-transport-key' }, fetch: async (_url, init) => {
        requests++;
        const body = JSON.parse(init!.body as string);
        const answers = sdkAnswers({ model: 'scripted-not-live', rules: outcomes.map((outcome, i) =>
          ruleAnswer(i < input.policy.rules.length ? input.policy.rules[i]!.id : 'builtin:policy-integrity', outcome)) }, 1, body.questions);
        return Response.json({ model: 'scripted-not-live', answers });
      } })(input, signal, recording);
    } });
    assert.equal(report.total, assessments);
    assert.equal(report.passed, assessments);
    assert.equal(report.summary.evaluationFailures.count, 0);
    assert.equal(requests, budget);
    assert.ok(report.rows.every(row => row.execution === 'not-executed'));
    const guide = readFileSync(new URL('../eval/README.md', import.meta.url), 'utf8');
    assert.match(guide, new RegExp(`Budget: ${budget} HTTP requests[.]\\n[ ]+bun eval/local-work-replay[.]ts --live --set=${set} `));
  });
}
