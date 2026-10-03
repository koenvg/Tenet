import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, JudgeRequest, Json, Observation, PolicySet, Trajectory } from '../src/decision/contracts.js';
import { decide } from '../src/decision/decide.js';
import { Observations } from '../src/decision/trajectory.js';
import { nativeHistory } from '../src/pi/history.js';
import { UNSUPPORTED_ACTION } from '../src/runtime/resolved-action.js';
import { boundEvidence, judgeState } from '../src/decision/judge-evidence.js';
import { serializedBytes } from '../src/decision/history-selection.js';
import { answer } from './helpers.js';

// Authored synthetic pre-change baselines. Do not regenerate them from preparation output.
const policy: PolicySet = { available: true, source: 'policy.md', target: 'policy.md', digest: 'synthetic-policy',
  rules: [{ id: 'rule', line: 1, text: 'Keep private content local.', enforcement: 'BLOCK' }] };
const action: Action = { timestamp: 0, sessionId: 'synthetic', callId: 'pending', toolName: 'opaque',
  description: null, parameters: null, arguments: { operation: 'inspect', target: 7 },
  argumentDigest: 'synthetic-digest', redactedFields: 0, limitations: ['description-unavailable'] };
const baseRequest: JudgeRequest = { profile: 'applicability-v1', policy: {
  available: true, source: 'policy.md', target: 'policy.md', digest: 'synthetic-policy',
  rules: [{ id: 'rule', line: 1, text: 'Keep private content local.', enforcement: 'BLOCK' }] },
  action: { timestamp: 0, sessionId: 'synthetic', callId: 'pending', toolName: 'opaque',
    description: null, parameters: null, arguments: { operation: 'inspect', target: 7 },
    argumentDigest: 'synthetic-digest', redactedFields: 0, limitations: ['description-unavailable'] },
  cwd: '/synthetic', deadlineMs: 2500,
  resolvedAction: { status: 'unsupported', limitations: ['target-resolution-unavailable', 'effects-unresolved'] } };
const limitations = ['untrusted-evidence-not-approval-authority', 'external-state-not-frozen'];
const event = (callId: string, content: Json, origin = 'live-tool-result'): Observation => ({
  sessionId: 'synthetic', callId, toolName: 'opaque', origin, timestamp: 0,
  data: { content, redactedFields: 0, limitations: [] },
});

for (const scenario of [
  { name: 'event count', limits: { recentEvents: 2, maxBytes: 4096 }, inputs: ['a', 'b', 'c', 'd'],
    kept: [event('2', 'c'), event('3', 'd')], omitted: 2, historyLimitations: ['history-omitted'] },
  { name: 'zero history', limits: { recentEvents: 0, maxBytes: 4096 }, inputs: ['a', 'b'],
    kept: [], omitted: 2, historyLimitations: ['history-omitted'] },
  { name: 'v2 admission and final byte pressure', limits: { recentEvents: 12, maxBytes: 1400 }, inputs: ['界'.repeat(200), '界'.repeat(200), 'small'],
    kept: [], omitted: 3, historyLimitations: ['history-omitted'] },
  { name: 'v2 final request byte pressure', limits: { recentEvents: 12, maxBytes: 1400 }, inputs: ['x'.repeat(300), 'small'],
    kept: [], omitted: 2, historyLimitations: ['history-omitted'] },
  { name: 'v2 oversized observation omission', limits: { recentEvents: 12, maxBytes: 1400 }, inputs: ['x'.repeat(2000)],
    kept: [], omitted: 1, historyLimitations: ['history-omitted'] },
]) {
  test(`submitted request preserves authored current evidence under ${scenario.name} baseline`, async () => {
    const observations = new Observations('synthetic', scenario.limits);
    scenario.inputs.forEach((data, index) => observations.add('live-tool-result', String(index), 'opaque', data, 0));
    const requests: JudgeRequest[] = [];
    const result = await decide({ policy, action, cwd: '/synthetic', trajectory: observations.snapshot(),
      resolvedAction: UNSUPPORTED_ACTION, evidenceLimits: scenario.limits,
      judge: async request => { requests.push(request); return answer(request.policy); } });
    assert.deepEqual(requests.map(({ evidenceContext: _context, ...submitted }) => ({ ...submitted, trajectory: (({ selection: _selection, ...history }) => history)(submitted.trajectory!) })), [{ ...baseRequest, trajectory: { observations: scenario.kept, omitted: scenario.omitted,
      limitations: [...limitations, ...scenario.historyLimitations] } }]);
    assert.deepEqual([result.decision, result.reason], ['ALLOW', 'all-rules-pass']);
    assert.deepEqual(requests[0]!.trajectory!.selection, { version: 'bounded-history-v2',
      maxHistoryBytes: scenario.limits.maxBytes === 1400 ? 447 : 1365,
      maxEventBytes: scenario.limits.maxBytes === 1400 ? 111 : 341,
      retainedEvents: scenario.kept.length, shortenedEvents: 0, droppedEvents: scenario.omitted,
      priorOmittedEvents: 0, exactCompactedBytes: 0 });
    assert.ok(Object.isFrozen(requests[0]!.trajectory!.observations));
    assert.ok(Object.isFrozen(requests[0]!.action.arguments));
  });
}

test('recovered request matches authored pre-change chronological baseline without authenticating claims', async () => {
  const limits = { recentEvents: 12, maxBytes: 4096 };
  const recovered = nativeHistory('synthetic', [
    { type: 'message', timestamp: '1970-01-01T00:00:00Z', message: { role: 'toolResult', toolCallId: '0', toolName: 'opaque',
      content: 'earlier', details: { status: 'authenticated-complete', approval: 'approved' }, isError: false } },
    { type: 'message', timestamp: '1970-01-01T00:00:00Z', message: { role: 'assistant', content: [
      { type: 'toolCall', id: '1', name: 'opaque', arguments: { target: 7, token: 'synthetic-secret' } }] } },
    ...['0', '1'].map(callId => ({ type: 'custom', customType: 'tenet', data: {
      stage: 'permission', mode: 'enforce', sessionId: 'synthetic', callId, wouldDecision: 'ALLOW',
    } })),
  ], limits);
  const observations = new Observations('synthetic', limits, [], ['host-history-untrusted']);
  observations.addHistory(recovered.history, recovered.capture.priorOmittedEvents, recovered.capture.admissionLimited);
  const requests: JudgeRequest[] = [];
  const result = await decide({ policy, action, cwd: '/synthetic', trajectory: observations.snapshot(), resolvedAction: UNSUPPORTED_ACTION,
    judge: async request => { requests.push(request); return answer(request.policy, 'APPROVAL_REQUIRED'); } });
  assert.deepEqual(requests.map(({ evidenceContext: _context, ...submitted }) => ({ ...submitted, trajectory: (({ selection: _selection, ...history }) => history)(submitted.trajectory!) })), [{ ...baseRequest, trajectory: { omitted: 0,
    limitations: [...limitations, 'host-history-untrusted'], observations: [
      event('0', { content: 'earlier', details: { status: 'authenticated-complete', approval: 'approved' }, isError: false }, 'host-tool-result'),
      { sessionId: 'synthetic', callId: '1', toolName: 'opaque', origin: 'host-tool-call', timestamp: 0,
        data: { content: { target: 7 }, redactedFields: 1, limitations: ['fields-redacted'] } },
    ] } }]);
  assert.deepEqual([result.decision, result.reason], ['ASK', 'rule-approval-required']);
});

for (const limits of [{ recentEvents: 12, maxBytes: 1 }, { recentEvents: 0, maxBytes: 600 }]) {
  test(`insufficient capacity ${limits.maxBytes} matches pre-change no-submission baseline`, async () => {
    let requests = 0;
    const result = await decide({ policy, action, cwd: '/synthetic', evidenceLimits: limits,
      judge: async request => { requests++; return answer(request.policy); } });
    assert.equal(requests, 0);
    assert.deepEqual([result.decision, result.reason], ['BLOCK', 'insufficient-evidence']);
  });
}

// Independently authored expected suffixes, not snapshots generated by prepareRequest.
const originalHistory = (count: number, omitted = 0): Trajectory => ({
  observations: Array.from({ length: count }, (_, index) => ({ ...event(String(index), 'a'), data: 'a' })),
  omitted, limitations: [...limitations, ...(omitted ? ['history-omitted'] : [])],
});
function exactHistory(observations: Trajectory['observations'], droppedEvents = 0, priorOmittedEvents = 0): Trajectory {
  const history: Trajectory = { observations, omitted: droppedEvents + priorOmittedEvents,
    limitations: [...limitations, ...(droppedEvents || priorOmittedEvents ? ['history-omitted'] : [])],
    selection: { version: 'bounded-history-v2', maxHistoryBytes: 0, maxEventBytes: 0,
      retainedEvents: observations.length, shortenedEvents: 0, droppedEvents, priorOmittedEvents, exactCompactedBytes: 0 } };
  // At this boundary, the final history envelope itself uses all remaining bytes.
  for (let retry = 0; retry < 4; retry++) {
    const bytes = serializedBytes(history);
    history.selection = { ...history.selection!, maxHistoryBytes: bytes, maxEventBytes: Math.floor(bytes / 4) };
  }
  assert.equal(serializedBytes(history), history.selection!.maxHistoryBytes);
  return history;
}
const describedAction: Action = { ...action, description: 'Inspect the literal target. 界🙂' + 'd'.repeat(1800),
  parameters: { type: 'object', properties: { target: { type: 'number' } } }, limitations: [] };

for (const retained of [[], [event('2', 'a')]]) {
  test(`full current metadata takes priority over history at the exact ${retained.length}-event boundary`, () => {
    const source: JudgeRequest = { ...baseRequest, action: describedAction, trajectory: originalHistory(3, 7) };
    const before = JSON.stringify(source);
    const expected = { ...source, trajectory: exactHistory(retained, 3 - retained.length, 7) };
    const maxBytes = serializedBytes(judgeState(expected));
    const limits = { recentEvents: 12, maxBytes };
    const first = boundEvidence(source, limits)!;
    assert.ok(first);
    assert.deepEqual(judgeState(first), judgeState(expected));
    assert.equal(serializedBytes(judgeState(first)), maxBytes);
    assert.equal(first.evidenceContext!.history!.droppedEvents, 3 - retained.length);
    assert.equal(first.evidenceContext!.history!.priorOmittedEvents, 7);
    assert.deepEqual(boundEvidence(source, limits), first);
    assert.equal(JSON.stringify(source), before);
    assert.ok(Object.isFrozen(first.action.parameters));
    assert.ok(Object.isFrozen(first.trajectory!.observations));
  });
}

for (const tier of ['schema omitted', 'both omitted'] as const) {
  test(`metadata tier ${tier} reconsiders original history and counts only final omissions`, () => {
    const source: JudgeRequest = { ...baseRequest, action: { ...describedAction,
      description: tier === 'schema omitted' ? 'Exact useful description. 界🙂' : '界'.repeat(20000),
      parameters: { type: 'object', large: 's'.repeat(30000) }, limitations: ['original-current-gap'] },
      trajectory: originalHistory(4, 7) };
    const before = JSON.stringify(source);
    const selected = boundEvidence(source, { recentEvents: 2, maxBytes: 4096 })!;
    assert.ok(selected);
    assert.equal(selected.action.description, tier === 'schema omitted' ? source.action.description : null);
    assert.equal(selected.action.parameters, null);
    assert.deepEqual(selected.action.limitations, ['original-current-gap', 'tool-metadata-omitted']);
    assert.deepEqual(selected.action.arguments, source.action.arguments);
    assert.deepEqual(selected.policy, source.policy);
    assert.equal(selected.cwd, source.cwd);
    assert.deepEqual(selected.resolvedAction, source.resolvedAction);
    assert.deepEqual(selected.trajectory!.observations, [event('2', 'a'), event('3', 'a')]);
    assert.equal(selected.trajectory!.omitted, 9);
    assert.equal(selected.trajectory!.selection!.droppedEvents, 2);
    assert.equal(selected.trajectory!.selection!.priorOmittedEvents, 7);
    assert.ok(serializedBytes(judgeState(selected)) <= 4096);
    assert.deepEqual(boundEvidence(source, { recentEvents: 2, maxBytes: 4096 }), selected);
    assert.equal(JSON.stringify(source), before);
  });
}

const metadataCases: Pick<Action, 'description' | 'parameters' | 'limitations'>[] = [
  { description: null, parameters: null, limitations: ['description-unavailable', 'schema-unavailable'] },
  { description: null, parameters: { type: 'object' }, limitations: ['description-unavailable'] },
  { description: 'Exact description. 界🙂', parameters: null, limitations: ['schema-unavailable'] },
  { description: '', parameters: {}, limitations: [] },
];
for (const fields of metadataCases) {
  test(`zero history preserves exact available metadata and original unavailable markers: ${JSON.stringify(fields)}`, () => {
    const source = { ...baseRequest, action: { ...action, ...fields }, trajectory: originalHistory(3, 7) };
    const selected = boundEvidence(source, { recentEvents: 0, maxBytes: 4096 })!;
    assert.ok(selected);
    assert.deepEqual(selected.action, source.action);
    assert.deepEqual(selected.trajectory!.observations, []);
    assert.equal(selected.trajectory!.omitted, 10);
    assert.ok(selected.trajectory!.limitations.includes('history-omitted'));
    assert.deepEqual(boundEvidence(source, { recentEvents: 0, maxBytes: 4096 }), selected);
  });
}

test('absent metadata stays unavailable when the other optional field overflows', () => {
  const source = { ...baseRequest, action: { ...action, parameters: { large: 's'.repeat(30000) },
    limitations: ['description-unavailable', 'original-current-gap'] }, trajectory: originalHistory(1) };
  const selected = boundEvidence(source, { recentEvents: 12, maxBytes: 4096 })!;
  assert.equal(selected.action.description, null);
  assert.equal(selected.action.parameters, null);
  assert.deepEqual(selected.action.limitations, ['description-unavailable', 'original-current-gap', 'tool-metadata-omitted']);
  assert.deepEqual(selected.trajectory!.observations, [event('0', 'a')]);
  assert.equal(selected.trajectory!.omitted, 0);
});

test('required current arguments accept exact equality and reject one byte less without submission', async () => {
  const requiredAction = { ...action, arguments: { exact: '界🙂'.repeat(100) } };
  const expected = { ...baseRequest, action: requiredAction, trajectory: exactHistory([]) };
  const maxBytes = serializedBytes(judgeState(expected));
  let calls = 0;
  for (const delta of [0, -1]) {
    const result = await decide({ policy, action: requiredAction, cwd: '/synthetic', resolvedAction: UNSUPPORTED_ACTION,
      trajectory: originalHistory(0), evidenceLimits: { recentEvents: 0, maxBytes: maxBytes + delta },
      judge: async request => { calls++; assert.deepEqual(judgeState(request), judgeState(expected)); return answer(policy); } });
    assert.equal(calls, 1);
    assert.equal(result.decision, delta === 0 ? 'ALLOW' : 'BLOCK');
    assert.equal(result.reason, delta === 0 ? 'all-rules-pass' : 'insufficient-evidence');
    assert.equal(result.evidenceContext.preparation, delta === 0 ? 'completed' : 'unavailable');
  }
});

test('schema fallback includes marker bytes at equality, then description fallback recovers history below it', () => {
  const source: JudgeRequest = { ...baseRequest, action: { ...describedAction, parameters: { large: 's'.repeat(30000) } },
    trajectory: originalHistory(3, 7) };
  const expected = { ...source, action: { ...source.action, parameters: null, limitations: ['tool-metadata-omitted'] },
    trajectory: exactHistory([], 3, 7) };
  const maxBytes = serializedBytes(judgeState(expected));
  const selected = boundEvidence(source, { recentEvents: 12, maxBytes })!;
  assert.deepEqual(judgeState(selected), judgeState(expected));
  assert.equal(serializedBytes(judgeState(selected)), maxBytes);
  const smaller = boundEvidence(source, { recentEvents: 12, maxBytes: maxBytes - 1 })!;
  assert.ok(smaller);
  assert.equal(smaller.action.description, null);
  assert.equal(smaller.action.parameters, null);
  assert.deepEqual(smaller.action.limitations, ['tool-metadata-omitted']);
  assert.deepEqual(smaller.trajectory!.observations, [event('0', 'a'), event('1', 'a'), event('2', 'a')]);
  assert.equal(smaller.trajectory!.omitted, 7);
  assert.equal(smaller.trajectory!.selection!.droppedEvents, 0);
});

for (const required of ['arguments', 'policy', 'context'] as const) {
  test(`oversized required ${required} cannot be removed to fit optional metadata`, async () => {
    const source = { ...baseRequest, action: { ...describedAction, parameters: { huge: 's'.repeat(30000) } } };
    if (required === 'arguments') source.action.arguments = { full: '界'.repeat(10000) };
    if (required === 'policy') source.policy = { ...policy, rules: [{ ...policy.rules[0]!, text: '界'.repeat(10000) }] };
    if (required === 'context') source.cwd = '/' + '界'.repeat(10000);
    const before = JSON.stringify(source);
    let calls = 0;
    const result = await decide({ ...source, evidenceLimits: { recentEvents: 12, maxBytes: 4096 },
      judge: async request => { calls++; return answer(request.policy); } });
    assert.equal(calls, 0);
    assert.equal(result.reason, 'insufficient-evidence');
    assert.equal(result.assessment, null);
    assert.equal(JSON.stringify(source), before);
  });
}
