import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { guardHarness } from './guard-harness.js';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { answer, sdkAnswers } from './helpers.js';
import { readArchive } from '../src/recording/archive.js';

import { fixtureSubmissions } from './recording-fixture.js';

export async function recordRuleFixture(directory: string) {
  const submitted: any[] = [];
  const h = await guardHarness({ policy: 'Rule; Never commit. <img src=x onerror="window.hostile=true">\nRule; WARN; Never publish.',
    env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: directory },
    createJudge: () => createSystemOneJudge({ baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', auth: { type: 'bearer', token: 'offline-only' }, fetch: async (_url, init) => {
      const payload = JSON.parse(init!.body as string); submitted.push(payload);
      const kind = payload.state.proposedToolCall.arguments.scenario;
      const assessment = answer({ rules: [{ id: 'first' }, { id: 'second' }] } as any);
      const first = assessment.rules[0]!;
      if (kind === 'low-pass') first.outcome = { choice: 'PASS', probabilities: { PASS: .88, FAIL: .04, UNKNOWN: .04, APPROVAL_REQUIRED: .04, NOT_APPLICABLE: 0 } };
      if (kind === 'unknown') first.outcome = { choice: 'UNKNOWN', probabilities: { PASS: 0, FAIL: 0, UNKNOWN: 1, APPROVAL_REQUIRED: 0, NOT_APPLICABLE: 0 } };
      if (kind === 'approval') first.outcome = { choice: 'APPROVAL_REQUIRED', probabilities: { PASS: 0, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 1, NOT_APPLICABLE: 0 } };
      if (kind === 'evidence') first.evidence = { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: .2, INSUFFICIENT: .8 } };
      if (kind === 'evidence-confidence') first.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .8, INSUFFICIENT: .2 } };
      if (kind === 'warn') assessment.rules[1]!.outcome = { choice: 'FAIL', probabilities: { PASS: 0, FAIL: 1, UNKNOWN: 0, APPROVAL_REQUIRED: 0, NOT_APPLICABLE: 0 } };
      if (kind === 'integrity') assessment.rules[2]!.outcome = { choice: 'FAIL', probabilities: { PASS: 0, FAIL: 1, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } };
      return Response.json({ model: 'offline-rules', answers: sdkAnswers(assessment, 1, payload.questions) });
    } }) });
  try {
    await h.start();
    for (const kind of ['low-pass', 'unknown', 'approval', 'evidence', 'evidence-confidence', 'warn', 'integrity']) {
      await h.call(kind, { scenario: kind, text: '<script>window.hostile=true</script>', token: 'secret' });
      await h.assessed(kind);
      await h.captured();
    }
    await h.shutdownCaptured();
    await writeFile(h.file, 'Rule; Changed current policy.');
    const archived = await readArchive(directory);
    assert.deepEqual(archived.issues, [], 'Rule capture must satisfy archive validation');
    for (const callId of ['low-pass', 'unknown', 'approval', 'evidence', 'evidence-confidence', 'warn', 'integrity']) {
      const records = archived.records.filter(r => r.cwd === h.cwd && r.callId === callId);
      assert.ok(records.some(r => r.stage === 'assessment-status' && r.data.status === 'completed'), `Missing completed assessment: ${callId}`);
      assert.ok(records.some(r => r.stage === 'execution'), `Missing execution: ${callId}`);
    }
    const requests = archived.records.filter(r => r.stage === 'request' && r.cwd === h.cwd);
    assert.equal(requests.length, 7);
    assert.deepEqual(fixtureSubmissions(archived.records.filter(r => r.cwd === h.cwd)).filter(s => s.status === 'completed').map((s: any) => s.payload), submitted);
    assert.ok(!JSON.stringify(h.records).includes('contributions'), 'archive-only contribution metadata');
    return { records: archived.records, submitted };
  } finally { await h.close(); }
}
