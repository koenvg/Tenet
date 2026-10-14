import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Dir } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { startInspector } from '../src/inspector/server.js';
import { sessionKey } from '../src/recording/archive.js';
import { readPrivateFile } from '../src/recording/files.js';
import { FixtureArchiveWriter as ArchiveWriter } from './archive-fixture.js';

async function fixture(run: (root: string, handles: Set<Dir>) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-shutdown-')));
  const handles = new Set<Dir>(), read = Dir.prototype.read;
  const spy = mock.method(Dir.prototype, 'read', function (this: Dir, ...args: unknown[]) {
    if (this.path === root || this.path.startsWith(`${root}/`)) handles.add(this);
    return Reflect.apply(read, this, args);
  });
  try { await run(root, handles); }
  finally {
    spy.mock.restore();
    for (const handle of handles) { try { await handle.close(); } catch {} }
    await rm(root, { recursive: true, force: true });
  }
}

async function boundedArchive(root: string) {
  for (let n = 0; n < 129; n++) {
    const folder = join(root, sessionKey(`session-${n}`));
    await mkdir(folder, { mode: 0o700 });
    await writeFile(join(folder, 'record.json'), '{', { mode: 0o600 });
    for (let f = 0; f < 8; f++) await writeFile(join(folder, `${f}.noop`), '');
  }
}

async function assertClosed(handles: Set<Dir>) {
  assert.ok(handles.size > 1, 'the scan opened root and session directories');
  for (const handle of handles) await assert.rejects(handle.read(), { code: 'ERR_DIR_CLOSED' });
}

function pause() {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  return { gate, started, release, entered };
}

test('inspector shutdown closes root and session cursors retained by a bounded scan', () => fixture(async (root, handles) => {
  await boundedArchive(root);
  const app = await startInspector({ directory: root });
  let appClosed = false;
  try {
    const response = await fetch(`${app.origin}/api/status`);
    assert.equal(response.status, 200);
    const status = await response.json() as { reader: { indexing: boolean } };
    assert.equal(status.reader.indexing, true);
    assert.ok([...handles].some(handle => handle.path === root));
    assert.ok([...handles].filter(handle => handle.path !== root).length > 1);
    // These are live handles, not only cursors that the scan already closed.
    for (const handle of handles) assert.ok(await handle.read());
    await app.close(); appClosed = true;
    await assertClosed(handles);
    await Promise.all([app.close(), app.close()]);
    await assert.rejects(fetch(`${app.origin}/api/status`));
  } finally { if (!appClosed) await app.close(); }
}));

test('index shutdown waits for an active refresh and prevents new reads', () => fixture(async (root, handles) => {
  await boundedArchive(root);
  const read = pause();
  const index = new ArchiveIndex(root, async (directory, path) => {
    read.entered(); await read.gate;
    return readPrivateFile(directory, path);
  });
  const refresh = index.refresh();
  await read.started;
  let closed = false;
  const closing = index.close().then(() => { closed = true; });
  try {
    await setImmediate();
    assert.equal(closed, false, 'shutdown cannot finish while a scan read is active');
    await assert.rejects(index.refresh(), /archive-closed/);
    await assert.rejects(index.detail(sessionKey('session-0'), sessionKey('i')), /archive-closed/);
  } finally { read.release(); await refresh; await closing; }
  await assertClosed(handles);
  await index.close();
  await assert.rejects(index.refresh(), /archive-closed/);
}));

test('index shutdown waits for selected detail reads before closing retained cursors', () => fixture(async (root, handles) => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  writer.bindHistorical({ sessionId: 'detail', invocationId: 'i', callId: 'c', toolName: 'edit', cwd: '/p', mode: 'observe' }, 1)('begin', {});
  await writer.complete();
  const folder = join(root, sessionKey('detail'));
  for (let n = 0; n < 700; n++) await writeFile(join(folder, `${n}.noop`), '');
  const read = pause();
  let holdDetail = false;
  const index = new ArchiveIndex(root, async (directory, path) => {
    if (holdDetail) { read.entered(); await read.gate; }
    return readPrivateFile(directory, path);
  });
  for (let n = 0; n < 8 && !index.sessions().items.length; n++) await index.refresh();
  assert.equal(index.sessions().items.length, 1);
  holdDetail = true;
  const detail = index.detail(sessionKey('detail'), sessionKey('i'));
  await read.started;
  let closed = false;
  const closing = index.close().then(() => { closed = true; });
  try {
    await setImmediate();
    assert.equal(closed, false, 'shutdown cannot clear metadata during a detail read');
  } finally { read.release(); }
  const result = await detail;
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.readIssues, []);
  await closing;
  await assertClosed(handles);
}));
