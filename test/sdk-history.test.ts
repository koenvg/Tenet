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
      // Count the prefix without reading it, even when no history is retained.
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
        retainedEvents: recentEvents ? 1 : 0, shortenedEvents: 0, droppedEvents: recentEvents ? 2 : 3,
        priorOmittedEvents: 0, exactCompactedBytes: 0 });
      assert.deepEqual([result.permission, result.assessment.status, result.assessment.wouldDecision, result.reason],
        ['released', 'completed', 'ALLOW', 'all-rules-pass']);
      assert.ok(Object.isFrozen(requests[0]!.trajectory!.observations));
    } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}
