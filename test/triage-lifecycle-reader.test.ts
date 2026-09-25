import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveWriter, readArchive, qualifiedSessionKey, recordInvocationKey } from '../src/recording/archive.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { invocationView } from '../src/inspector/view.js';

const lifecycle = async (root: string, base: Record<string, unknown>, id: string, status: string) => {
  const record = { ...base, schemaVersion: 3, invocationId: id, callId: id, eventId: randomUUID(),
    sequence: Number(base.sequence) + (status === 'dropped' ? 2 : 1), timestamp: Date.now(),
    stage: 'assessment-status', data: { status, reason: status === 'dropped' ? 'queue-capacity' : 'not-started', profile: 'legacy' } };
  await writeFile(join(root, qualifiedSessionKey('pi', 'same', 'main'), `${id}.json`), JSON.stringify(record), { mode: 0o600 });
};

test('read-only schema 3 lifecycle folds pending and dropped records with schema 2 identity, not invented decisions', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-schema3-')));
  try {
    const writer = new ArchiveWriter({ enabled: true, directory: root });
    writer.bind({ sessionId: 'same', invocationId: 'old', callId: 'old', toolName: 'read', cwd: '/p', mode: 'observe', host: 'pi', contextId: 'main' })('begin', {});
    await writer.close();
    const folder = join(root, qualifiedSessionKey('pi', 'same', 'main'));
    const base = JSON.parse(await readFile(join(folder, (await readdir(folder))[0]!), 'utf8'));
    await lifecycle(root, base, 'pending', 'pending');
    await lifecycle(root, base, 'dropped', 'dropped');
    const index = new ArchiveIndex(root); await index.refresh();
    const archive = await readArchive(root);
    assert.equal(archive.records.filter(r => r.schemaVersion === 3).length, 2);
    assert.deepEqual(archive.issues, []);
    const rows = index.invocations(qualifiedSessionKey('pi', 'same', 'main')).items;
    assert.equal(rows.length, 3);
    for (const status of ['pending', 'dropped']) {
      const row = rows.find(r => r.callId === status)!;
      assert.equal(row.assessmentStatus, status);
      assert.deepEqual(row.categories, ['pending']);
      assert.equal(row.decision, 'unavailable');
      const detail = await index.detail(qualifiedSessionKey('pi', 'same', 'main'), row.id);
      assert.equal(invocationView(detail.records).assessmentStatus, status);
      assert.equal(recordInvocationKey(detail.records[0]!), row.id);
    }
    assert.equal(index.status().unsupported, 0);
    assert.equal(index.sessions().items[0]?.invocations, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});
