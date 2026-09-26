import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { guardHarness } from './guard-harness.js';
import { createJevJudge } from '../src/decision/jev.js';
import { answer } from './helpers.js';
import { readArchive } from '../src/recording/archive.js';

export async function recordRuleFixture(directory: string) {
  const submitted: any[] = [];
  const h = await guardHarness({ policy: 'Rule; Never commit. <img src=x onerror="window.hostile=true">\nRule; WARN; Never publish.',
    env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: directory },
    createJudge: () => createJevJudge({ apiKey: 'offline-only', fetch: async (_url, init) => {
      const payload = JSON.parse(init!.body as string); submitted.push(payload);
      const kind = payload.state.action.callId;
      const assessment = answer(payload.state.policy);
      const first = assessment.rules[0]!;
      if (kind === 'low-pass') first.outcome = { choice: 'PASS', probabilities: { PASS: .88, FAIL: .04, UNKNOWN: .04, APPROVAL_REQUIRED: .04 } };
      if (kind === 'unknown') first.outcome = { choice: 'UNKNOWN', probabilities: { PASS: 0, FAIL: 0, UNKNOWN: 1, APPROVAL_REQUIRED: 0 } };
      if (kind === 'approval') first.outcome = { choice: 'APPROVAL_REQUIRED', probabilities: { PASS: 0, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 1 } };
      if (kind === 'evidence') first.evidence = { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: .2, INSUFFICIENT: .8 } };
      if (kind === 'evidence-confidence') first.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .8, INSUFFICIENT: .2 } };
      if (kind === 'warn') assessment.rules[1]!.outcome = { choice: 'FAIL', probabilities: { PASS: 0, FAIL: 1, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } };
      if (kind === 'integrity') assessment.rules[2]!.outcome = { choice: 'FAIL', probabilities: { PASS: 0, FAIL: 1, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } };
      return Response.json({ model: 'offline-rules', answers: Object.fromEntries(assessment.rules.flatMap((r, i) => [
        [`rule_${i}_outcome`, { type: 'choice', ...r.outcome, confidence: 1 }],
        [`rule_${i}_evidence`, { type: 'choice', ...r.evidence, confidence: 1 }],
      ])) });
    } }) });
  try {
    await h.start();
    for (const kind of ['low-pass', 'unknown', 'approval', 'evidence', 'evidence-confidence', 'warn', 'integrity']) {
      await h.call(kind, { text: '<script>window.hostile=true</script>', token: 'secret' });
      await h.assessed(kind);
    }
    await h.emit('session_shutdown');
    await writeFile(h.file, 'Rule; Changed current policy.');
    const archived = await readArchive(directory);
    const requests = archived.records.filter(r => r.stage === 'request' && r.cwd === h.cwd);
    assert.equal(requests.length, 7);
    assert.deepEqual(requests.map(r => r.data.payload), submitted);
    assert.ok(!JSON.stringify(h.records).includes('contributions'), 'archive-only contribution metadata');
    return { records: archived.records, submitted };
  } finally { await h.close(); }
}
