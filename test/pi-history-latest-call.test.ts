import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { JudgeRequest } from '../src/decision/contracts.js';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';
import { readArchive } from '../src/recording/archive.js';

const oversizedId = 'x'.repeat(8193); // One character above the default native identity allowance.
const previous = { toolName: 'read', arguments: { path: '/synthetic/OLD.md' } };
const unavailable = { status: 'unavailable' };
const scenarios = [
  { name: 'newer unassessed call', ids: ['old', 'unassessed'], assessed: ['old'], expected: unavailable, loss: 1 },
  { name: 'newer oversized-ID call', ids: ['old', oversizedId], assessed: ['old', oversizedId], expected: unavailable, loss: 1 },
  { name: 'reliable absence', ids: [], assessed: [], expected: null, loss: 0 },
  { name: 'older unassessed call', ids: ['unassessed', 'old'], assessed: ['old'], expected: previous, loss: 0 },
  { name: 'older oversized-ID call', ids: [oversizedId, 'old'], assessed: [oversizedId, 'old'], expected: previous, loss: 0 },
];

// Exercise registerGuard recovery through the compiled SDK, not a reconstructed preparation path.
for (const recording of ['off', 'on']) for (const scenario of scenarios) {
  test(`Pi hook preserves latest-call context with ${scenario.name}, recording ${recording}`, async () => {
    const requests: JudgeRequest[] = [];
    let payloadReads = 0, fetches = 0;
    const excluded = new Proxy({}, { ownKeys() { payloadReads++; throw new Error('excluded payload must not be normalized'); } });
    const h = await guardHarness({ env: { TENET_MODE: 'enforce', TENET_RECORDING: recording }, judge: async request => {
      requests.push(request);
      return answer(request.policy, 'UNKNOWN');
    } });
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => { fetches++; throw new Error('live requests forbidden'); };
    try {
      h.branch.push(
        // Reverse timestamps must not change native branch order.
        ...scenario.ids.map((id, index) => ({ type: 'message', timestamp: index ? '2000-01-01T00:00:00Z' : '2026-01-01T00:00:00Z',
          message: { role: 'assistant', content: [
            { type: 'thinking', thinking: 'EXCLUDED_THINKING_CANARY' },
            { type: 'toolCall', id, name: 'read', arguments: id === 'old' ? previous.arguments : excluded },
          ] } })),
        ...scenario.assessed.map(callId => ({ type: 'custom', customType: 'tenet', data: {
          stage: 'assessment-status', status: 'completed', mode: 'enforce', sessionId: 's', callId,
          consent: 'PRIVATE_CONSENT_CANARY',
        } })),
      );
      await h.start();
      const input = { path: '/synthetic/CURRENT.md', text: 'synthetic' };
      const veto = await h.call('current', input);
      assert.ok(veto?.block, 'UNKNOWN must still block in enforce mode');
      assert.equal(requests.length, 1);
      const request = requests[0]!;
      const ordinary = request.judgeScopes!.groups.find(group => group.kind === 'ordinary')!.state;
      assert.deepEqual(ordinary.previousToolCall, scenario.expected);
      assert.deepEqual(ordinary.thinkingTrace, unavailable);
      assert.deepEqual(ordinary.proposedToolCall, { toolName: 'edit', arguments: input });
      assert.deepEqual(request.trajectory!.observations.map(event => event.callId), scenario.ids.some(id => id === 'old') ? ['old'] : []);
      assert.equal(request.trajectory!.selection!.priorOmittedEvents, scenario.loss);
      assert.equal(request.trajectory!.selection!.droppedEvents, 0);
      assert.equal(request.trajectory!.limitations.includes('history-admission-window'), false);
      assert.equal(request.evidenceContext!.resolution.status, 'unsupported');
      assert.doesNotMatch(JSON.stringify(request), /unassessed|EXCLUDED_THINKING_CANARY|PRIVATE_CONSENT_CANARY/);
      const snapshot = JSON.stringify(request);
      await h.call('later');
      assert.deepEqual(requests[1]!.judgeScopes!.groups.find(group => group.kind === 'ordinary')!.state.previousToolCall,
        { toolName: 'edit', arguments: input }, 'a later live call establishes new previous-call context');
      assert.equal(JSON.stringify(request), snapshot, 'later history must not change the submitted recovery snapshot');
      await h.emit('session_shutdown');
      const archive = await readArchive(join(h.cwd, 'archive'));
      assert.deepEqual(archive.issues, []);
      if (recording === 'off') assert.equal(archive.records.length, 0);
      else assert.ok(archive.records.some(row => row.callId === 'current' && row.stage === 'assessment'));
      assert.doesNotMatch(JSON.stringify(archive.records), /EXCLUDED_THINKING_CANARY|PRIVATE_CONSENT_CANARY/);
      assert.equal(payloadReads, 0);
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = oldFetch;
      await h.close();
    }
  });
}
