import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';

test('archive preserves every rule contribution even without an SDK request', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-rules-')));
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: directory }, judge: async request => {
    const result = answer(request.policy);
    assert.ok(result.rules[0]);
    result.rules[0].outcome = { choice: 'PASS', probabilities: { PASS: .88, FAIL: .04, UNKNOWN: .04, APPROVAL_REQUIRED: .04 } };
    return result;
  } });
  try {
    await h.start(); await h.call(); await h.assessed(); await h.emit('session_shutdown');
    const { records } = await readArchive(directory);
    const view = invocationView(records);
    assert.equal(view.rules.length, 2);
    assert.ok(view.rules[0]); assert.ok(view.rules[1]);
    assert.equal(view.rules[1].builtin, true);
    assert.ok(view.rules[1].text.includes('Never modify'));
    assert.equal(view.rules[0].contribution, 'blocking-gates');
    assert.deepEqual(view.rules[0].gateIds, ['outcome-confidence-below-threshold']);
    assert.equal(view.rules[0].result?.outcome.choice, 'PASS');
    assert.equal(view.rules[1].contribution, 'pass');
    assert.deepEqual(view.rules[1].gateIds, []);
    assert.equal(view.rules[0].questions, null);
    assert.equal(view.rules[0].thresholds.effectThreshold, .9);
  } finally { await h.close(); await rm(directory, { recursive: true, force: true }); }
});

test('missing decision diagnostics are unknown, not passing, and thresholds are not recomputed', () => {
  const records: any[] = [{ stage: 'begin', data: { policy: { rules: [{ id: 'r', text: 'old', line: 3, enforcement: 'WARN' }] }, config: { effectThreshold: .12 } } },
    { stage: 'assessment', data: { assessment: { rules: [{ ruleId: 'r', outcome: { choice: 'PASS', probabilities: { PASS: .01 } } }] }, config: { effectThreshold: .99 } } }];
  const rule = invocationView(records).rules[0];
  assert.ok(rule);
  assert.equal(rule.contribution, 'unavailable');
  assert.equal(rule.gateIds, null);
  assert.equal(rule.thresholds.effectThreshold, .99);
});

test('offline SDK archive and restarted HTTP reader retain all-rule distributions and exact mappings', async () => {
  const { recordRuleFixture } = await import('./rule-fixture.js');
  const { startInspector } = await import('../src/inspector/server.js');
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-rule-api-')));
  const { submitted } = await recordRuleFixture(directory);
  try {
    for (let restart = 0; restart < 2; restart++) {
      const app = await startInspector({ directory });
      try {
        const get = async (path: string): Promise<any> => (await fetch(app.origin + path)).json();
        const session = (await get('/api/sessions')).sessions[0].id;
        const calls = (await get(`/api/sessions/${session}`)).invocations;
        assert.equal(calls.length, 7);
        for (const call of calls) {
          const { view } = await get(`/api/sessions/${session}/invocations/${call.id}`);
          const payload = submitted.find(p => p.state.action.callId === view.identity.callId);
          assert.equal(view.rules.length, 3);
          assert.deepEqual(view.evidence, payload.state);
          for (const rule of view.rules) {
            assert.deepEqual(rule.questions.outcome, payload.questions[rule.mapping.outcomeKey]);
            assert.deepEqual(rule.questions.evidence, payload.questions[rule.mapping.evidenceKey]);
            assert.equal(Object.keys(rule.result.outcome.probabilities).length, 4);
            assert.equal(Object.keys(rule.result.evidence.probabilities).length, 2);
            assert.equal(rule.thresholds.effectThreshold, .9);
          }
          const first = view.rules[0];
          if (view.identity.callId === 'low-pass') {
            assert.equal(first.result.outcome.choice, 'PASS');
            assert.deepEqual(first.gateIds, ['outcome-confidence-below-threshold']);
          }
          if (view.identity.callId === 'approval') assert.equal(first.contribution, 'approval-required');
          if (view.identity.callId === 'unknown') assert.deepEqual(first.gateIds, ['outcome-unknown']);
          if (view.identity.callId === 'evidence') assert.deepEqual(first.gateIds, ['evidence-insufficient', 'evidence-confidence-below-threshold']);
          if (view.identity.callId === 'warn') assert.equal(view.rules[1].contribution, 'advisory-gates');
          if (view.identity.callId === 'integrity') assert.equal(view.rules[2].contribution, 'blocking-gates');
        }
      } finally { await app.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('historical question text and unknown gate IDs are projected verbatim, without current evaluator logic', () => {
  const outcome = { question: '<script>old question</script>', choices: { PASS: 'historical choice' } };
  const records: any[] = [
    { stage: 'request', data: { policy: { rules: [{ id: 'old-rule', text: 'Historical rule', line: 42, enforcement: 'WARN' }] },
      mapping: [{ id: 'old-rule', outcomeKey: 'historical_outcome', evidenceKey: 'historical_evidence' }],
      payload: { questions: { historical_outcome: outcome }, state: {} } } },
    { stage: 'decision', data: { decision: 'BLOCK', diagnostics: [{ ruleId: 'old-rule', gates: ['future-gate'], effectThreshold: .123 }] } },
  ];
  const view = invocationView(records);
  assert.deepEqual(view.rules[0]?.questions?.outcome, outcome);
  assert.equal(view.rules[0]?.questions?.evidence, null);
  assert.deepEqual(view.rules[0]?.gateIds, ['future-gate']);
  assert.equal(view.rules[0]?.thresholds.effectThreshold, .123);
  assert.equal(view.rules[0]?.line, 42);
});
