import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPolicy, INTEGRITY_ID } from '../src/decision/policy.js';
import { createApusJudge } from '../src/decision/apus.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';

// Exercise the delivery fixture through the real judge boundary, with no live backend.
test('scripted archive backend scores both source roles independently and keeps integrity separate', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet-archive-native-set-'));
  try {
    const candidates = (['global', 'project'] as const).map(role => ({ role,
      source: join(root, `${role}.md`), selection: 'local' as const, presence: 'present' as const }));
    for (const candidate of candidates) await writeFile(candidate.source, 'Rule; Preserve owner data.');
    const policy = await loadPolicy(candidates); assert.ok(policy.available);
    const { scriptedNative, alias, baseUrl } = await import(pathToFileURL(resolve('scripts/fixtures/archive-native.mjs')).href);
    for (const outcome of ['PASS', 'FAIL', 'APPROVAL_REQUIRED'] as const) {
      let starts = 0;
      const native: { fetch: NonNullable<Parameters<typeof createApusJudge>[0]['fetch']>; calls: { path: string }[] } = scriptedNative({ ruleCount: policy.rules.length, outcome: () => outcome,
        beforeCompletion: async (question: number) => { if (question === 0) starts++; } });
      const result = await decide({ policy, cwd: root,
        action: captureAction({ sessionId: 'scripted', callId: outcome, toolName: 'inert', arguments: {} }),
        judge: createApusJudge({ baseUrl, model: alias, fetch: native.fetch }) });
      assert.equal(starts, 1);
      assert.equal(result.decision, outcome === 'PASS' ? 'ALLOW' : outcome === 'FAIL' ? 'BLOCK' : 'ASK');
      assert.deepEqual(result.assessment?.rules.map(rule => [rule.ruleId, rule.outcome.choice]),
        [...policy.rules.map(rule => [rule.id, outcome]), [INTEGRITY_ID, 'PASS']]);
      assert.equal(native.calls.filter((call: { path: string }) => call.path === '/completion').length, 6);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
