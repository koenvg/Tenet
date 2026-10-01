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
      await session.beforeTool({ ...call, current: () => ({ sessionId: 'one', contextId: 'main', ...call }) });
      assert.equal(requests.length, 1);
      const trajectory = requests[0]!.trajectory!;
      assert.equal(trajectory.omitted, recentEvents ? 2 : 3);
      assert.ok(trajectory.limitations.includes('history-omitted'));
      assert.deepEqual(trajectory.observations.map(e => e.callId), recentEvents ? ['small'] : []);
      assert.doesNotMatch(JSON.stringify(trajectory), /canary-secret|evicted|xxxxxxxx/);
      if (recentEvents) assert.match(JSON.stringify(trajectory), /untrusted history/);
    } finally { await guard.close(); await rm(cwd, { recursive: true, force: true }); }
  });
}
