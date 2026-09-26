import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFile, mkdtemp, realpath, rm, rename, symlink, mkdir, readdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionKey } from '../src/recording/archive.js';
import { ArchiveWriter } from './legacy-recording-fixture.js';
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
  assert.equal(sessions.items[0]!.concerns, 0, 'a BLOCK decision without recorded gates is not a proven violation');
  assert.equal(sessions.items[0]!.unavailable, 0, 'missing assessment stages are incomplete, not evaluator failures');
  assert.equal(sessions.items[0]!.categoryCounts.pending, 4);
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

test('metadata traversal is bounded and a deep session cannot starve another session', () => fixture(async root => {
  const deep = sessionKey('deep'), shallow = sessionKey('shallow');
  await mkdir(join(root, deep), { mode: 0o700 });
  for (let n = 0; n < 1100; n++) await writeFile(join(root, deep, `${String(n).padStart(5, '0')}.tmp`), '');
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  writer.bind({ sessionId: 'shallow', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' })('begin', {});
  await writer.close();
  const index = new ArchiveIndex(root);
  await index.refresh();
  assert.equal(index.indexing, true, 'unfinished directory enumeration is partial coverage even without parsing');
  assert.equal(index.sessions().items[0]?.sessionId, 'shallow', 'small sessions get a turn while deep ones are traversed');
  for (let n = 0; n < 12 && index.indexing; n++) await index.refresh();
  assert.equal(index.indexing, false);
  await rm(join(root, shallow), { recursive: true });
  for (let n = 0; n < 12 && index.sessions().items.length; n++) await index.refresh();
  assert.equal(index.sessions().items.length, 0, 'deleted session is eventually removed after a bounded root sweep');
}));

test('bounded sweeps eventually invalidate changed, removed, and unsafe cached files', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  writer.bind({ sessionId: 'changing', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' })('begin', {});
  await writer.close();
  const folder = join(root, sessionKey('changing'));
  const file = join(folder, (await readdir(folder))[0]!);
  for (let n = 0; n < 700; n++) await writeFile(join(folder, `${n}.noop`), '');
  const index = new ArchiveIndex(root);
  for (let n = 0; n < 8 && (n === 0 || index.indexing); n++) await index.refresh();
  assert.equal(index.sessions().items.length, 1);
  async function untilGone() {
    for (let n = 0; n < 8 && index.sessions().items.length; n++) await index.refresh();
    assert.equal(index.sessions().items.length, 0);
  }
  await chmod(file, 0o644); await untilGone();
  await chmod(file, 0o600);
  for (let n = 0; n < 8 && !index.sessions().items.length; n++) await index.refresh();
  assert.equal(index.sessions().items.length, 1);
  await writeFile(file, '{'); await untilGone();
  await rm(file); await symlink('/etc/passwd', file);
  for (let n = 0; n < 8; n++) await index.refresh();
  assert.equal(index.sessions().items.length, 0);
  assert.ok(index.issues().some(issue => issue.reason === 'unsafe-or-unreadable-record'));
}));

test('replacing a deep session directory drops its old cached metadata immediately', () => fixture(async root => {
  const folder = join(root, sessionKey('replaced'));
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  writer.bind({ sessionId: 'replaced', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' })('begin', {});
  await writer.close();
  const source = join(folder, (await readdir(folder))[0]!);
  for (let n = 0; n < 1200; n++) await copyFile(source, join(folder, `${n}.json`));
  const index = new ArchiveIndex(root);
  for (let n = 0; n < 8 && (n === 0 || index.indexing); n++) await index.refresh();
  assert.equal(index.sessions().items.length, 1);
  await rename(folder, join(root, 'retired'));
  await mkdir(folder, { mode: 0o700 });
  await index.refresh();
  assert.equal(index.sessions().items.length, 0);
}));

test('replacing an archive root clears cached sessions before the new root sweep finishes', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  writer.bind({ sessionId: 'old', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' })('begin', {});
  await writer.close();
  const index = new ArchiveIndex(root); await index.refresh();
  assert.equal(index.sessions().items.length, 1);
  const retired = `${root}-retired`;
  await rename(root, retired);
  try {
    await mkdir(root, { mode: 0o700 });
    for (let n = 0; n < 200; n++) await mkdir(join(root, sessionKey(`new-${n}`)), { mode: 0o700 });
    await index.refresh();
    assert.equal(index.sessions().items.length, 0);
    assert.equal(index.indexing, true);
  } finally { await rm(retired, { recursive: true, force: true }); }
}));

test('a session beyond the open-cursor cap still gets a turn', () => fixture(async root => {
  const ids = Array.from({ length: 257 }, (_, n) => `many-${n}`);
  for (const id of ids) {
    const folder = join(root, sessionKey(id));
    await mkdir(folder, { mode: 0o700 });
    for (let n = 0; n < 32; n++) await writeFile(join(folder, `${n}.noop`), '');
  }
  const last = (await readdir(root)).at(-1)!;
  const chosen = ids.find(id => sessionKey(id) === last)!;
  await rm(join(root, last), { recursive: true });
  await mkdir(join(root, last), { mode: 0o700 });
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  writer.bind({ sessionId: chosen, invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' })('begin', {});
  await writer.close();
  const index = new ArchiveIndex(root);
  for (let n = 0; n < 4; n++) await index.refresh();
  assert.ok(index.sessions().items.some(row => row.sessionId === chosen));
}));

test('root deletion reconciliation advances in bounded rounds', () => fixture(async root => {
  const ids = Array.from({ length: 300 }, (_, n) => `root-${n}`);
  for (const id of ids) await mkdir(join(root, sessionKey(id)), { mode: 0o700 });
  const last = (await readdir(root)).at(-1)!;
  const chosen = ids.find(id => sessionKey(id) === last)!;
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  writer.bind({ sessionId: chosen, invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' })('begin', {});
  await writer.close();
  const index = new ArchiveIndex(root);
  for (let n = 0; n < 8 && (n === 0 || index.indexing); n++) await index.refresh();
  assert.equal(index.sessions().items.length, 1);
  for (const id of ids) await rm(join(root, sessionKey(id)), { recursive: true });
  for (let n = 0; n < 8 && index.sessions().items.length; n++) await index.refresh();
  assert.equal(index.sessions().items.length, 0);
}));

test('issue counts clear with a removed issue-heavy session', () => fixture(async root => {
  const session = sessionKey('issues'), folder = join(root, session);
  await mkdir(folder, { mode: 0o700 });
  for (let n = 0; n < 700; n++) await writeFile(join(folder, `${n}.tmp`), '');
  await writeFile(join(folder, 'newer.json'), '{"schemaVersion":999}', { mode: 0o600 });
  await writeFile(join(folder, 'broken.json'), '{', { mode: 0o600 });
  const index = new ArchiveIndex(root);
  for (let n = 0; n < 8 && (n === 0 || index.indexing); n++) await index.refresh();
  const before = index.status();
  assert.deepEqual([before.otherIssues, before.unsupported, before.newerUnsupported, before.corrupt], [700, 1, 1, 1]);
  await rm(folder, { recursive: true });
  await index.refresh();
  const after = index.status();
  assert.deepEqual([after.otherIssues, after.unsupported, after.newerUnsupported, after.corrupt], [0, 0, 0, 0]);
}));

test('unsafe session directory stays reported across root reconciliation and recovers', () => fixture(async root => {
  const folder = join(root, sessionKey('unsafe'));
  await mkdir(folder, { mode: 0o755 });
  const index = new ArchiveIndex(root);
  await index.refresh(); await index.refresh();
  assert.ok(index.issues().some(issue => issue.reason === 'unsafe-session-directory'));
  assert.equal(index.status().otherIssues, 1);
  await chmod(folder, 0o700); await index.refresh();
  assert.equal(index.status().otherIssues, 0);
}));
