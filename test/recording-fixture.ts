import assert from 'node:assert/strict';
import { createJevJudge } from '../src/decision/jev.js';
import { guardHarness } from './guard-harness.js';
import { answer, sdkAnswers } from './helpers.js';
import { readArchive } from '../src/recording/archive.js';

export async function recordFixture(directory: string) {
  const submitted: any[] = [];
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: directory },
    createJudge: () => createJevJudge({ apiKey: 'fixture-transport-secret', fetch: async (_url, init) => {
      const payload = JSON.parse(init!.body as string); submitted.push(payload);
      const assessment = answer(payload.state.policy, submitted.length === 1 ? 'PASS' : 'FAIL');
      return Response.json({ model: 'scripted-offline', answers: sdkAnswers(assessment) });
    } }) });
  try {
    await h.start();
    await h.call('passing', { text: '<script>window.hostile = true</script>', token: 'redacted-secret' });
    await h.assessed('passing');
    await h.emit('tool_result', { toolCallId: 'passing', toolName: 'edit', content: [], isError: false });
    await h.call('concerning', { text: 'git commit -m example' });
    await h.assessed('concerning');
    await h.emit('session_shutdown');
    const archived = await readArchive(directory);
    assert.equal(archived.records.filter(r => r.stage === 'request').length, 2);
    assert.deepEqual(archived.records.filter(r => r.stage === 'request').map(r => r.data.payload), submitted);
    assert.ok(!JSON.stringify(archived).includes('fixture-transport-secret'));
    assert.ok(!JSON.stringify(archived).includes('redacted-secret'));
    assert.ok(!JSON.stringify(h.records).includes('window.hostile'));
    assert.ok(!JSON.stringify(submitted[1].state.trajectory).includes('recording'));
    return { submitted, records: archived.records };
  } finally { await h.close(); }
}
