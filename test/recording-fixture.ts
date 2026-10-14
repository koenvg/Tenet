import assert from 'node:assert/strict';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { guardHarness } from './guard-harness.js';
import { answer, sdkAnswers } from './helpers.js';
import { readArchive } from '../src/recording/archive.js';
import { SCHEMA_VERSION } from '../src/recording/contract.js';

import { recordedSubmissions } from '../src/recording/scoped.js';
import type { ArchiveRecord } from '../src/recording/contract.js';
// Submission resolution is per invocation; these fixtures contain multiple calls.
export function fixtureSubmissions(records: ArchiveRecord[]) {
  return [...new Set(records.map(r => r.invocationId))].flatMap(id => recordedSubmissions(records.filter(r => r.invocationId === id)));
}

export async function recordFixture(directory: string) {
  const submitted: any[] = [];
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: directory },
    createJudge: () => createSystemOneJudge({ baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', auth: { type: 'bearer', token: 'fixture-transport-secret' }, fetch: async (_url, init) => {
      const payload = JSON.parse(init!.body as string); submitted.push(payload);
      const assessment = answer(undefined, submitted.length <= 3 ? 'PASS' : 'FAIL');
      return Response.json({ model: 'scripted-offline', answers: sdkAnswers(assessment, 1, payload.questions) });
    } }) });
  try {
    await h.start();
    await h.call('passing', { text: '<script>window.hostile = true</script>', token: 'redacted-secret' });
    await h.assessed('passing');
    await h.captured();
    await h.emit('tool_result', { toolCallId: 'passing', toolName: 'edit', content: [], isError: false });
    await h.captured();
    await h.call('concerning', { text: 'git commit -m example' });
    await h.assessed('concerning');
    await h.shutdownCaptured();
    const archived = await readArchive(directory);
    assert.deepEqual(archived.issues, [], 'Current capture must satisfy archive validation');
    assert.ok(archived.records.every(record => record.schemaVersion === SCHEMA_VERSION), 'Current capture must not use historical fixtures');
    assert.equal(archived.records.filter(r => r.stage === 'request').length, 2);
    assert.deepEqual(fixtureSubmissions(archived.records).filter(s => s.status === 'completed').map((s: any) => s.payload), submitted);
    assert.ok(!JSON.stringify(archived).includes('fixture-transport-secret'));
    assert.ok(!JSON.stringify(archived).includes('redacted-secret'));
    assert.ok(!JSON.stringify(h.records).includes('window.hostile'));
    assert.ok(!JSON.stringify(submitted.map(p => p.state)).includes('recording'));
    return { submitted, records: archived.records };
  } finally { await h.close(); }
}
