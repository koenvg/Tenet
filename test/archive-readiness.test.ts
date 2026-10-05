import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readPrivateFile, writeStageFile } from '../src/recording/files.js';

test('static archive readiness follows persistence completion, not the shutdown deadline', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-readiness-')));
  let persisted!: () => void;
  const finished = new Promise<void>(resolve => { persisted = resolve; });
  let firstWrite = true;
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root }, undefined, async (...args) => {
    if (firstWrite) {
      firstWrite = false;
      // Deliberately cross the unchanged 1-second production drain bound.
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    await writeStageFile(...args);
    persisted();
  });
  try {
    writer.bind({ host: 'pi', contextId: 'main', sessionId: 's', invocationId: 'i', callId: 'c', toolName: 'read', cwd: '/tmp', mode: 'observe' })('begin', {});
    await writer.complete();
    let reads = 0;
    const index = new ArchiveIndex(root, async (directory, file) => { reads++; return readPrivateFile(directory, file); });
    await index.refresh();
    assert.equal(reads, 1, 'no timeout health stage belongs in this clean static archive');
    assert.equal(index.indexing, false);
    assert.deepEqual(index.issues(), []);
    assert.equal(index.sessions().items[0]?.invocations, 1);
  } finally {
    await finished;
    await writer.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('static archive readiness rejects capture loss instead of accepting a partial fixture', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-readiness-loss-')));
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root }, { events: 1, bytes: 10000 });
  try {
    const sink = writer.bind({ host: 'pi', contextId: 'main', sessionId: 's', invocationId: 'i', callId: 'c', toolName: 'read', cwd: '/tmp', mode: 'observe' });
    sink('begin', {}); sink('decision', { decision: 'ALLOW' });
    await assert.rejects(writer.complete(), /Static archive fixture did not finish cleanly/);
    assert.equal(writer.health().dropped, 1);
  } finally {
    assert.equal(await writer.close(), true);
    await rm(root, { recursive: true, force: true });
  }
});
