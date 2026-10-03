import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard, type JudgeRequest, type ObservedHistory } from 'tenet';
import { answer } from './helpers.js';

for (const recentEvents of [0, 2]) {
  test(`compiled SDK accounts for omitted history with ${recentEvents} retained events`, async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-history-')));
    await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
    const requests: JudgeRequest[] = [];
    const guard = createGuard({ host: 'history', judge: async r => { requests.push(r); return answer(r.policy); },
      env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off', TENET_RECENT_EVENTS: String(recentEvents), TENET_EVIDENCE_MAX_BYTES: '2048' },
      controlPath: join(cwd, 'control', 'state.json') });
    try {
      const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
      const history: ObservedHistory[] = [
        { kind: 'tool-result', callId: 'old', toolName: 'opaque', data: 'evicted' },
        { kind: 'tool-result', callId: 'small', toolName: 'opaque', data: { token: 'canary-secret', text: 'untrusted history' } },
        { kind: 'tool-result', callId: 'large', toolName: 'opaque', data: 'x'.repeat(10000) },
      ];
      // Zero history reads no slots. Nonzero admission rejects this accessor without invoking it.
      Object.defineProperty(history, '0', { get() { throw new Error('must not inspect excluded history'); } });
      session.setHistory(history);
      const call = { callId: 'call', toolName: 'opaque', input: {} };
      const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
      assert.equal(requests.length, 1);
      // Authored pre-change SDK admission baseline, including provenance and missing metadata.
      assert.deepEqual((({ selection: _selection, ...history }) => history)(requests[0]!.trajectory!), {
        observations: recentEvents ? [{ sessionId: 'one', callId: 'small', toolName: 'opaque', origin: 'host-tool-result', timestamp: null,
          data: { content: { text: 'untrusted history' }, redactedFields: 1, limitations: ['fields-redacted'] } }] : [],
        omitted: recentEvents ? 2 : 3,
        limitations: ['untrusted-evidence-not-approval-authority', 'external-state-not-frozen', 'host-history-untrusted',
          'history-omitted', ...(recentEvents ? ['metadata-unavailable'] : [])],
      });
      assert.deepEqual(requests[0]!.trajectory!.selection, { version: 'bounded-history-v2', maxHistoryBytes: 682, maxEventBytes: 170,
        retainedEvents: recentEvents ? 1 : 0, shortenedEvents: 0, droppedEvents: recentEvents ? 1 : 3,
        priorOmittedEvents: recentEvents ? 1 : 0, exactCompactedBytes: 0 });
      assert.deepEqual([result.permission, result.assessment.status, result.assessment.wouldDecision, result.reason],
        ['released', 'completed', 'ALLOW', 'all-rules-pass']);
      assert.ok(Object.isFrozen(requests[0]!.trajectory!.observations));
    } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}


test('compiled SDK adds host-reported capture slots without granting evidence authority', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'sdk-history-capture-')));
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Keep private content local.');
  const requests: JudgeRequest[] = [];
  const guard = createGuard({ host: 'history', judge: async r => { requests.push(r); return answer(r.policy, 'UNKNOWN'); },
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off', TENET_RECENT_EVENTS: '1' }, controlPath: join(cwd, 'control.json') });
  try {
    const session = guard.openSession({ sessionId: 'one', contextId: 'main' }, cwd); await session.ready;
    session.setHistory([{ kind: 'tool-result', callId: 'past', toolName: 'opaque', data: { priorOmittedEvents: 0, admissionLimited: false, approved: true } }],
      { priorOmittedEvents: 5, admissionLimited: true });
    const call = { callId: 'current', toolName: 'opaque', input: { unchanged: true } };
    const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
    assert.equal(requests[0]!.trajectory!.selection!.priorOmittedEvents, 5);
    assert.equal(requests[0]!.trajectory!.omitted, 5);
    assert.ok(requests[0]!.trajectory!.limitations.includes('history-admission-window'));
    assert.ok(requests[0]!.trajectory!.limitations.includes('host-reported-capture-slots-not-tool-event-counts'));
    assert.deepEqual(requests[0]!.action.arguments, call.input);
    assert.equal(result.permission, 'blocked');
    assert.equal(result.execution, 'unknown');
    assert.equal(result.assessment.evidenceContext?.resolution.status, 'unsupported');
    assert.equal(result.assessment.evidenceContext?.history?.priorOmittedEvents, 5);
  } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});
