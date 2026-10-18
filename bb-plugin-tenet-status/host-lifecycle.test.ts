import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import hostEntry from './host.js';

const threadId = 'thr_fixture0001';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function fixture(count: number) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'tenet-host-cache-')));
  const roots = Array.from({ length: count }, (_, n) => join(base, String(n)));
  for (const root of roots) {
    await mkdir(root, { mode: 0o700 });
    await Promise.all(Array.from({ length: 129 }, (_, n) => mkdir(join(root, n.toString(16).padStart(64, '0')), { mode: 0o700 })));
  }
  const host = experimental_createHostEntryHarness(hostEntry);
  const refresh = ArchiveIndex.prototype.refresh;
  const indexes: ArchiveIndex[] = [];
  ArchiveIndex.prototype.refresh = function () {
    if (!indexes.includes(this)) indexes.push(this);
    return refresh.call(this);
  };
  return {
    roots, indexes, host,
    read: (root: string) => host.experimental_call('readStatus', { threadId, recordingDirectory: root }),
    async cleanup() {
      await host.experimental_dispose();
      await Promise.all(indexes.map(index => index.close()));
      ArchiveIndex.prototype.refresh = refresh;
      await rm(base, { recursive: true, force: true });
    },
  };
}

test('multi-root eviction closes only discarded indexes and disposal closes every retained index', async () => {
  const f = await fixture(10);
  try {
    for (const root of f.roots) assert.equal((await f.read(root)).coverage, 'unknown');
    assert.equal(f.indexes.length, 10);
    for (const index of f.indexes.slice(0, 2)) await assert.rejects(index.refresh(), /archive-closed/);
    for (const index of f.indexes.slice(2)) {
      assert.equal(index.indexing, true);
      await index.refresh();
    }
    await f.host.experimental_dispose();
    for (const index of f.indexes) await assert.rejects(index.refresh(), /archive-closed/);
  } finally { await f.cleanup(); }
});

test('losing one archive closes its cached index without closing an unrelated archive', async () => {
  const f = await fixture(2);
  try {
    for (const root of f.roots) assert.equal((await f.read(root)).coverage, 'unknown');
    await rm(f.roots[0]!, { recursive: true });
    assert.equal((await f.read(f.roots[0]!)).coverage, 'unavailable');
    await assert.rejects(f.indexes[0]!.refresh(), /archive-closed/);
    assert.equal((await f.read(f.roots[1]!)).coverage, 'unknown');
    assert.equal(f.indexes.length, 2);
  } finally { await f.cleanup(); }
});

test('a failed refresh closes the cached index and allows a fresh index for the same root', async () => {
  const f = await fixture(1);
  const refresh = ArchiveIndex.prototype.refresh;
  try {
    assert.equal((await f.read(f.roots[0]!)).coverage, 'unknown');
    const failed = f.indexes[0]!;
    ArchiveIndex.prototype.refresh = function () {
      return this === failed ? Promise.reject(new Error('synthetic-read-failure')) : refresh.call(this);
    };
    assert.equal((await f.read(f.roots[0]!)).coverage, 'unavailable');
    ArchiveIndex.prototype.refresh = refresh;
    await assert.rejects(failed.refresh(), /archive-closed/);
    assert.equal((await f.read(f.roots[0]!)).coverage, 'unknown');
    assert.equal(f.indexes.length, 2);
  } finally { ArchiveIndex.prototype.refresh = refresh; await f.cleanup(); }
});

test('concurrent cache misses await eviction cleanup before admitting replacement indexes', async () => {
  const f = await fixture(10);
  const close = ArchiveIndex.prototype.close;
  const entered = deferred(), gate = deferred();
  let closed = false;
  try {
    for (const root of f.roots.slice(0, 8)) await f.read(root);
    ArchiveIndex.prototype.close = async function () {
      if (this === f.indexes[0]) { entered.resolve(); await gate.promise; }
      await close.call(this);
      if (this === f.indexes[0]) closed = true;
    };
    const first = f.read(f.roots[8]!);
    assert.equal(await Promise.race([entered.promise.then(() => 'closing'), first.then(() => 'returned')]), 'closing');
    const second = f.read(f.roots[9]!);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.indexes.length, 8);
    assert.equal(closed, false);
    gate.resolve();
    assert.deepEqual((await Promise.all([first, second])).map(status => status.coverage), ['unknown', 'unknown']);
    assert.equal(closed, true);
    for (const index of f.indexes.slice(0, 2)) await assert.rejects(index.refresh(), /archive-closed/);
    for (const index of f.indexes.slice(2)) await index.refresh();
  } finally { gate.resolve(); ArchiveIndex.prototype.close = close; await f.cleanup(); }
});

test('disposal waits for an active refresh and closes its index before resolving', async () => {
  const f = await fixture(1);
  const refresh = ArchiveIndex.prototype.refresh;
  const entered = deferred(), gate = deferred();
  let disposed = false;
  ArchiveIndex.prototype.refresh = async function () { entered.resolve(); await gate.promise; await refresh.call(this); };
  try {
    const reading = f.read(f.roots[0]!);
    await entered.promise;
    const disposing = f.host.experimental_dispose().then(() => { disposed = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(disposed, false);
    gate.resolve();
    assert.equal((await reading).coverage, 'unknown');
    await disposing;
    assert.equal(disposed, true);
    await assert.rejects(refresh.call(f.indexes[0]!), /archive-closed/);
  } finally { gate.resolve(); ArchiveIndex.prototype.refresh = refresh; await f.cleanup(); }
});

test('a call still validating when disposal starts cannot populate the cache afterward', async () => {
  const f = await fixture(1);
  try {
    const reading = f.read(f.roots[0]!);
    await f.host.experimental_dispose();
    assert.equal((await reading).coverage, 'unavailable');
    assert.equal(f.indexes.length, 0);
  } finally { await f.cleanup(); }
});
