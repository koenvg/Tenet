import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureAction } from '../src/decision/evidence.js';
import { decide, DEFAULTS } from '../src/decision/decide.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import type { Assessment, Clock, Outcome } from '../src/decision/contracts.js';
import { answer, policy, ruleAnswer } from './helpers.js';

const action = captureAction({ sessionId: 's', callId: '1', toolName: 'unfamiliar', arguments: { arbitrary: [1, null, { source: 'hello' }] } });
const base = { policy, action, cwd: '/project' };

test('generic evidence preserves arbitrary arguments and explicitly marks missing metadata', () => {
  assert.deepEqual(action.arguments, { arbitrary: [1, null, { source: 'hello' }] });
  assert.equal(action.description, null); assert.equal(action.parameters, null);
  assert.ok(action.limitations.includes('description-unavailable'));
  assert.ok(action.limitations.includes('parameters-unavailable'));
});

test('field redaction removes credentials and configured fields without mutating execution arguments', () => {
  const args = { headers: { Authorization: 'secret1', Cookie: 'secret2', Accept: 'json' }, nested: [{ api_key: 'secret3', privateKey: 'secret4', custom: 'secret5', code: 'const a = 1' }] };
  const before = structuredClone(args);
  const captured = captureAction({ sessionId: 's', callId: 'c', toolName: 'x', arguments: args, parameters: { token: 'secret6' } }, ['custom']);
  assert.deepEqual(args, before); assert.ok(!JSON.stringify(captured).includes('secret'));
  assert.equal(captured.redactedFields, 6); assert.ok(captured.limitations.includes('fields-redacted'));
  assert.ok(Object.isFrozen(captured.arguments));
  assert.throws(() => captureAction({ sessionId: 's', callId: 'x', toolName: 'x', arguments: { value: undefined } }));
});

for (const [outcome, decision] of [['PASS', 'ALLOW'], ['APPROVAL_REQUIRED', 'ASK'], ['FAIL', 'BLOCK'], ['UNKNOWN', 'BLOCK']] as const) {
  test(`${outcome} maps to ${decision}`, async () => {
    const result = await decide({ ...base, judge: async () => answer(policy, outcome) });
    assert.equal(result.decision, decision);
    assert.equal(result.assessment?.rules[0]?.outcome.choice, outcome);
    assert.equal(result.config.effectThreshold, 0.90);
    assert.deepEqual(result.ruleIds, outcome === 'PASS' ? [] : [policy.rules[0]!.id]);
  });
}

test('WARN keeps all assessment gates visible without vetoing or requesting approval', async () => {
  for (const enforcement of ['WARN', 'BLOCK'] as const) {
    const selected = { ...policy, rules: [{ ...policy.rules[0]!, enforcement }] };
    for (const outcome of ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'] as const) {
      for (const gate of ['none', 'outcome', 'evidence-label', 'evidence-confidence']) {
        const raw = answer(selected, outcome, gate === 'outcome' ? 0.63 : 0.97);
        if (gate === 'evidence-label') raw.rules[0]!.evidence = { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: 0.1, INSUFFICIENT: 0.9 } };
        if (gate === 'evidence-confidence') raw.rules[0]!.evidence.probabilities = { SUFFICIENT: 0.89, INSUFFICIENT: 0.11 };
        const result = await decide({ ...base, policy: selected, judge: async () => raw });
        const blocked = gate !== 'none' || outcome === 'FAIL' || outcome === 'UNKNOWN';
        assert.equal(result.decision, enforcement === 'WARN' ? 'ALLOW' : blocked ? 'BLOCK' : outcome === 'APPROVAL_REQUIRED' ? 'ASK' : 'ALLOW');
        assert.equal(result.diagnostics.length, blocked ? 1 : 0);
        if (blocked) assert.equal(result.diagnostics[0]!.enforcement, enforcement);
        assert.equal(result.assessment?.rules[0]!.outcome.choice, outcome);
      }
    }
    const raw = answer(selected); raw.rules[1] = ruleAnswer(INTEGRITY_ID, 'FAIL');
    assert.equal((await decide({ ...base, policy: selected, judge: async () => raw })).decision, 'BLOCK');
  }
});

test('complete-set aggregation is permutation invariant; fail/unknown dominate approval', async () => {
  const selected = { ...policy, rules: [...policy.rules, { id: 'second', line: 2, text: 'Ask before installing packages.', enforcement: 'BLOCK' as const }] };
  const outcomes: Outcome[] = ['PASS', 'APPROVAL_REQUIRED', 'FAIL', 'UNKNOWN'];
  for (const a of outcomes) for (const b of outcomes) {
    const raw = { model: 'jev-test', rules: [ruleAnswer(selected.rules[0]!.id, a), ruleAnswer('second', b), ruleAnswer(INTEGRITY_ID)] };
    const expected = [a, b].some(o => o === 'FAIL' || o === 'UNKNOWN') ? 'BLOCK' : [a, b].includes('APPROVAL_REQUIRED') ? 'ASK' : 'ALLOW';
    for (const rules of [raw.rules, [...raw.rules].reverse()]) {
      assert.equal((await decide({ ...base, policy: selected, judge: async () => ({ ...raw, rules }) })).decision, expected);
    }
  }
});

test('integrity failure is non-overridable and cannot request approval', async () => {
  for (const outcome of ['FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED'] as const) {
    const raw = answer(); raw.rules[1] = ruleAnswer(INTEGRITY_ID, outcome);
    const result = await decide({ ...base, judge: async () => raw });
    assert.equal(result.decision, 'BLOCK');
    assert.equal(result.reason, outcome === 'FAIL' ? 'policy-integrity' : outcome === 'UNKNOWN' ? 'insufficient-evidence' : 'invalid-response');
  }
});

test('both probability gates apply to every rule at exact configured boundaries', async () => {
  assert.equal(DEFAULTS.deadlineMs, 2500);
  for (const index of [0, 1]) for (const p of [0.89, 0.90, 0.91]) for (const gate of ['outcome', 'evidence']) {
    const raw = answer();
    if (gate === 'outcome') raw.rules[index] = ruleAnswer(raw.rules[index]!.ruleId, 'PASS', p);
    else raw.rules[index]!.evidence.probabilities = { SUFFICIENT: p, INSUFFICIENT: 1 - p };
    assert.equal((await decide({ ...base, judge: async () => raw })).decision, p < 0.9 ? 'BLOCK' : 'ALLOW');
  }
  const raw = answer(); raw.rules[0]!.evidence = { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: 0.01, INSUFFICIENT: 0.99 } };
  assert.equal((await decide({ ...base, judge: async () => raw })).reason, 'insufficient-evidence');
  assert.equal((await decide({ ...base, config: { effectThreshold: 0.8 }, judge: async () => answer(policy, 'PASS', 0.85) })).decision, 'ALLOW');
  for (const effectThreshold of [NaN, Infinity, -0.1, 1.1]) {
    assert.equal((await decide({ ...base, config: { effectThreshold }, judge: async () => answer() })).reason, 'configuration');
  }
  let called = false;
  assert.equal((await decide({ ...base, policy: { available: false, source: '/bad', reason: 'policy-unavailable' }, judge: async () => { called = true; return answer(); } })).decision, 'BLOCK');
  assert.equal(called, false);
});

test('injected judges also require complete unique identities and valid distributions', async () => {
  const mutations: ((raw: any) => void)[] = [
    raw => { raw.model = ''; }, raw => { raw.rules.pop(); }, raw => { raw.rules.push(raw.rules[0]); },
    raw => { raw.rules[0].ruleId = 'unknown'; }, raw => { raw.rules[0].ruleId = INTEGRITY_ID; },
    raw => { raw.rules[0].outcome.probabilities.PASS = NaN; },
    raw => { raw.rules[0].outcome.probabilities.extra = 0; },
    raw => { raw.rules[0].outcome.choice = 'FAIL'; },
    raw => { raw.rules[0].evidence.probabilities = { SUFFICIENT: 1, INSUFFICIENT: 1 }; },
  ];
  for (const mutate of mutations) {
    const raw = answer(); mutate(raw);
    assert.equal((await decide({ ...base, judge: async () => raw })).reason, 'invalid-response');
  }
  for (const raw of [null, {}, { rules: [] }]) assert.equal((await decide({ ...base, judge: async () => raw })).reason, 'invalid-response');
  assert.equal((await decide({ ...base, judge: async () => { throw new Error('secret provider body'); } })).reason, 'provider-error');
  const raw = { ...answer(), prose: 'secret unsolicited explanation' };
  assert.ok(!JSON.stringify(await decide({ ...base, judge: async () => raw })).includes('secret'));
});

class ManualClock implements Clock {
  time = 0;
  callback?: () => void;
  now = () => this.time;
  schedule = (callback: () => void, _ms: number) => { this.callback = callback; return () => { this.callback = undefined; }; };
  advance(ms: number) { this.time += ms; this.callback?.(); }
}

test('deadline and cancellation block, abort transport and ignore late success', async () => {
  for (const reason of ['timeout', 'cancelled'] as const) {
    const clock = new ManualClock(), controller = new AbortController();
    let finish!: (a: Assessment) => void, receivedSignal!: AbortSignal;
    const pending = decide({ ...base, clock, signal: controller.signal, judge: async (request, signal) => {
      assert.equal(request.cwd, '/project'); receivedSignal = signal; return new Promise(resolve => { finish = resolve; });
    } });
    await Promise.resolve();
    if (reason === 'timeout') clock.advance(2500); else controller.abort();
    const result = await pending;
    assert.equal(result.reason, reason); assert.equal(receivedSignal.aborted, true);
    finish(answer()); await Promise.resolve();
    assert.equal(result.decision, 'BLOCK'); assert.equal(clock.callback, undefined);
  }
});

test('pre-cancelled calls never invoke judge; elapsed deadline checked before timer delivery', async () => {
  const controller = new AbortController(); controller.abort();
  assert.equal((await decide({ ...base, signal: controller.signal, judge: async () => { throw new Error('must not run'); } })).reason, 'cancelled');
  const clock = new ManualClock();
  assert.equal((await decide({ ...base, clock, judge: async () => { clock.time = 2501; return answer(); } })).reason, 'timeout');
});
