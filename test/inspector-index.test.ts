import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, symlink, mkdir, readdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveWriter, sessionKey } from '../src/recording/archive.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readPrivateFile } from '../src/recording/files.js';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-index-')));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('index filters projects, paginates, retains resumed sessions and reads only selected detail after indexing', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const sessionId = '../ arbitrary / ?#%雪';
  for (let n = 0; n < 5; n++) {
    const sink = writer.bind({ sessionId: n === 4 ? 'fork' : sessionId, invocationId: `i${n}`, callId: 'reused', toolName: 'edit', cwd: n === 4 ? '/b' : '/a', mode: 'observe' });
    sink('begin', { policy: { rules: [], secret: 'evidence-not-a-summary' } });
    if (n !== 3) sink('decision', { decision: n === 1 ? 'BLOCK' : 'ALLOW' });
  }
  await writer.close();
  let reads = 0;
  const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
  await index.refresh();
  const coldReads = reads;
  const sessions = index.sessions({ project: '/a', limit: 1 });
  assert.equal(sessions.items.length, 1);
  assert.equal(sessions.items[0]!.sessionId, sessionId);
  assert.equal(sessions.items[0]!.invocations, 4);
  assert.equal(sessions.items[0]!.concerns, 1);
  assert.equal(sessions.items[0]!.unavailable, 1);
  assert.ok(!JSON.stringify(sessions).includes('evidence-not-a-summary'));
  const page = index.invocations(sessionKey(sessionId), { limit: 2 });
  assert.equal(page.items.length, 2);
  assert.ok(page.next);
  const second = index.invocations(sessionKey(sessionId), { limit: 2, cursor: page.next! });
  assert.equal(second.items.length, 2);
  assert.equal(new Set([...page.items, ...second.items].map(i => i.id)).size, 4);
  await Promise.all([index.refresh(), index.refresh()]);
  assert.equal(reads, coldReads, 'refresh never rereads unchanged evidence');
  const selected = page.items.find(i => i.decision !== 'unavailable') ?? second.items.find(i => i.decision !== 'unavailable')!;
  const detail = await index.detail(sessionKey(sessionId), selected.id);
  assert.equal(detail.records.length, 2);
  assert.equal(reads, coldReads + 2, 'detail only reads the selected invocation');
  const resumed = new ArchiveWriter({ enabled: true, directory: root });
  resumed.bind({ sessionId, invocationId: 'resumed', callId: 'reused', toolName: 'edit', cwd: '/a', mode: 'observe' })('begin', {});
  await resumed.close();
  await index.refresh();
  assert.equal(index.sessions({ project: '/a' }).items[0]!.invocations, 5);
  assert.equal(reads, coldReads + 3);
  assert.equal(index.sessions({ project: '/b' }).items[0]!.sessionId, 'fork');
  // A new first-page item cannot shift an existing keyset page boundary.
  assert.deepEqual(index.invocations(sessionKey(sessionId), { limit: 2, cursor: page.next! }).items.map(i => i.id), second.items.map(i => i.id));
  await rm(join(root, sessionKey('fork')), { recursive: true });
  await index.refresh();
  assert.equal(index.sessions({ project: '/b' }).items.length, 0);
}));

test('writers capture canonical project path without changing the original cwd', () => fixture(async root => {
  const project = join(root, 'project'), alias = join(root, 'alias');
  await mkdir(project); await symlink(project, alias);
  const writer = new ArchiveWriter({ enabled: true, directory: join(root, 'archive') });
  writer.bind({ sessionId: 's', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: alias, mode: 'observe' })('begin', {});
  await writer.close();
  const index = new ArchiveIndex(join(root, 'archive'));
  await index.refresh();
  assert.deepEqual(index.sessions({ project }).items[0]!.projects, [project]);
  const detail = await index.detail(sessionKey('s'), sessionKey('i'));
  assert.equal(detail.records[0]!.cwd, alias);
  assert.equal(detail.records[0]!.project, project);
}));

test('refresh budgets new records, and detail limits expose incomplete capture', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const sink = writer.bind({ sessionId: 'bounded', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' });
  for (let n = 0; n < 300; n++) { sink('begin', {}); if (n % 32 === 0) await writer.drain(); }
  await writer.close();
  let reads = 0;
  const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
  await index.refresh();
  assert.equal(reads, 256); assert.equal(index.indexing, true);
  assert.ok(index.issues().some(i => i.reason === 'indexing-in-progress'));
  await index.refresh(); assert.equal(reads, 300); assert.equal(index.indexing, false);
  const detail = await index.detail(sessionKey('bounded'), sessionKey('i'));
  assert.equal(detail.records.length, 64);
  assert.ok(detail.issues.some(i => i.reason === 'invocation-detail-limit'));
  assert.equal(reads, 364);
}));

test('cached summaries disappear when records become unsafe or corrupt', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  writer.bind({ sessionId: 'safe', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' })('begin', {});
  await writer.close();
  const index = new ArchiveIndex(root); await index.refresh();
  assert.equal(index.sessions().items.length, 1);
  const folder = join(root, sessionKey('safe')), file = join(folder, (await readdir(folder))[0]!);
  await chmod(file, 0o644); await index.refresh();
  assert.equal(index.sessions().items.length, 0); assert.equal(index.issues().length, 1);
  await chmod(file, 0o600); await index.refresh();
  assert.equal(index.sessions().items.length, 1);
  await writeFile(file, '{'); await index.refresh();
  assert.equal(index.sessions().items.length, 0);
  await rm(file); await symlink('/etc/passwd', file); await index.refresh();
  assert.equal(index.sessions().items.length, 0); assert.equal(index.issues().length, 1);
}));

test('large-stage indexing and invocation detail enforce byte budgets', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const sink = writer.bind({ sessionId: 'large', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' });
  for (let n = 0; n < 6; n++) { sink('begin', { evidence: 'x'.repeat(3 * 1024 * 1024) }); await writer.drain(); }
  await writer.close();
  let reads = 0;
  const index = new ArchiveIndex(root, async (root, file) => { reads++; return readPrivateFile(root, file); });
  await index.refresh(); assert.equal(reads, 5); assert.equal(index.indexing, true);
  await index.refresh(); assert.equal(reads, 6); assert.equal(index.indexing, false);
  const detail = await index.detail(sessionKey('large'), sessionKey('i'));
  assert.equal(detail.records.length, 5); assert.equal(reads, 11);
  assert.ok(detail.issues.some(i => i.reason === 'invocation-detail-limit'));
}));
