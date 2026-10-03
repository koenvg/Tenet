import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, JudgeRequest, PolicySet } from '../src/decision/contracts.js';
import { decide } from '../src/decision/decide.js';
import { Observations } from '../src/decision/trajectory.js';
import { nativeHistory } from '../src/pi/history.js';
import { UNSUPPORTED_ACTION } from '../src/runtime/resolved-action.js';
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
const event = (callId: string, content: string | Record<string, unknown>, origin = 'live-tool-result') => ({
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
