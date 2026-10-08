import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { invocationView } from '../src/inspector/view.js';
import { recordSessionKey, recordInvocationKey } from '../src/recording/archive.js';
import { readPrivateFile } from '../src/recording/files.js';

for (const stage of ['assessment', 'validation', 'decision', 'assessment-status'] as const) test(`private invalid ${stage} fact invalidates with its stage, without changing BB status`, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-invalid-fact-')));
  try {
    const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
    const identity = { host: 'pi', contextId: 'main', sessionId: 'fictional-invalid', invocationId: 'one', callId: 'one', toolName: 'read', cwd: '/fictional', mode: 'observe' as const, bbThreadId: 'thr_fictional1' };
    const sink = writer.bindHistorical(identity, 4);
    sink('begin', {});
    sink(stage, { valid: false, status: 'completed', decision: 'ALLOW' });
    await writer.complete();
    const session = recordSessionKey({ ...identity, schemaVersion: 4 }), invocation = recordInvocationKey({ ...identity, schemaVersion: 4 });
    let reads = 0;
    const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
    const row = () => index.invocations(session).items[0]!;
    await index.refresh();
    assert.equal(row().assessmentInvalid, true);
    assert.equal(invocationView((await index.detail(session, invocation)).records).assessmentInvalid, true);
    const bb = JSON.stringify(index.threadStatus('thr_fictional1'));
    assert.ok(!bb.includes('assessmentInvalid'));
    const readCount = reads;
    await index.refresh(); row();
    assert.equal(reads, readCount, 'unchanged list reads do not hydrate details');
    const folder = join(root, session), file = (await readdir(folder)).find(f => f.includes('-000000000002-'))!;
    const record = JSON.parse(await readPrivateFile(root, join(folder, file)));
    record.data.valid = true;
    await writeFile(join(folder, file), JSON.stringify(record), { mode: 0o600 });
    await index.refresh();
    assert.equal(row().assessmentInvalid, false);
    const nextStatus = index.threadStatus('thr_fictional1');
    if (stage === 'validation') {
      assert.equal(JSON.parse(bb).assessments.unavailable, 1);
      assert.deepEqual(JSON.parse(bb).assessments.reasons, [{ code: 'validation-failed', count: 1 }]);
      assert.equal(nextStatus.assessments.incomplete, 1);
      assert.equal(nextStatus.failures, 0, 'validation failure is not a semantic violation');
      assert.ok(!JSON.stringify(nextStatus).includes('assessmentInvalid'));
    } else assert.equal(JSON.stringify(nextStatus), bb, 'unrelated BB projection stays unchanged');
    await rm(join(folder, file)); await index.refresh();
    assert.equal(row().assessmentInvalid, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
