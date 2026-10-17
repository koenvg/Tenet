import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dashboardHost } from '../bb-plugin-tenet-status/dashboard-host.js';
import { DashboardArchiveReader } from '../src/inspector/dashboard-reader.js';
import { dashboardMethods, dashboardHostMethods } from '../bb-plugin-tenet-status/dashboard-contract.js';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

const threadId = 'thr_fixture0001';
test('host Stop releases real admission without reopening or changing recorded replay', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-lifecycle-')));
  const host = dashboardHost();
  const start = () => host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'a'.repeat(64), recordingDirectory: root });
  try {
    for (let n = 0; n < 600; n++) await mkdir(join(root, n.toString(16).padStart(64, '0')), { mode: 0o700 });
    const chunks = await Promise.all(Array.from({ length: 4 }, start));
    assert.deepEqual(chunks.map(chunk => chunk.state), ['reading', 'reading', 'reading', 'reading']);
    assert.deepEqual((await start()).reasons, ['host-run-limit']);
    const token = chunks[0]!.next!;
    const recorded = await host.readDashboard({ kind: 'advance', token });
    const expected = structuredClone(recorded);
    assert.deepEqual(await host.stopDashboard({ token }), { stopped: true });
    assert.deepEqual(await host.stopDashboard({ token }), { stopped: true });
    recorded.reasons.push('caller-mutation');
    assert.deepEqual(await host.readDashboard({ kind: 'advance', token }), expected);
    assert.deepEqual((await host.readDashboard({ kind: 'advance', token: expected.next! })).reasons, ['host-acquisition-stopped']);
    assert.equal((await start()).state, 'reading');
    assert.deepEqual(await host.stopDashboard({ token: 'unknown' }), { stopped: true });
  } finally { await host.dispose(); await rm(root, { recursive: true, force: true }); }
});

for (const method of [dashboardMethods.dashboardStop, dashboardHostMethods.stopDashboard]) test('Stop has strict token-only schemas and a constant acknowledgement', () => {
  assert.deepEqual(method.input.parse({ token: 'opaque' }), { token: 'opaque' });
  for (const input of [{}, { token: '' }, { token: 1 }, { token: 'x', hostId: 'host_fixture0001' }, { token: 'x', recordingDirectory: '/tmp' }, { token: 'x', threads: [threadId] }])
    assert.equal(method.input.safeParse(input).success, false);
  assert.deepEqual(method.output.parse({ stopped: true }), { stopped: true });
  for (const output of [{ stopped: false }, { stopped: true, exists: true }, { stopped: true, rows: [] }]) assert.equal(method.output.safeParse(output).success, false);
});

test('Stop finds the consumed token during terminal close and counts the pending close against the four-scan cap', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-close-gap-')));
  const host = dashboardHost();
  const close = DashboardArchiveReader.prototype.close;
  const entered = deferred<void>(), gate = deferred<void>();
  let gated = false;
  DashboardArchiveReader.prototype.close = async function () {
    if (!gated) { gated = true; entered.resolve(); await gate.promise; }
    return close.call(this);
  };
  const start = () => host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'a'.repeat(64), recordingDirectory: root });
  try {
    const chunks = await Promise.all(Array.from({ length: 4 }, start));
    const token = chunks[0]!.next!;
    const terminal = host.readDashboard({ kind: 'advance', token });
    await entered.promise;
    let acknowledged = false;
    const stopped = host.stopDashboard({ token }).then(value => { acknowledged = true; return value; });
    await Promise.resolve();
    assert.equal(acknowledged, false);
    assert.deepEqual((await start()).reasons, ['host-run-limit']);
    gate.resolve();
    const result = await terminal;
    assert.equal(result.state, 'finished');
    assert.deepEqual(await stopped, { stopped: true });
    assert.deepEqual(await host.readDashboard({ kind: 'advance', token }), result);
    assert.equal((await start()).state, 'reading');
  } finally { gate.resolve(); DashboardArchiveReader.prototype.close = close; await host.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('failed host cleanup keeps admission charged and retries without reopening acquisition', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-close-retry-')));
  const host = dashboardHost();
  const close = DashboardArchiveReader.prototype.close;
  let fail = true;
  DashboardArchiveReader.prototype.close = async function () { if (fail) throw Error('close-failed'); return close.call(this); };
  const start = () => host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'a'.repeat(64), recordingDirectory: root });
  try {
    const chunks = await Promise.all(Array.from({ length: 4 }, start));
    const token = chunks[0]!.next!;
    await assert.rejects(host.stopDashboard({ token }), /close-failed/);
    assert.deepEqual((await start()).reasons, ['host-run-limit']);
    assert.deepEqual((await host.readDashboard({ kind: 'advance', token })).reasons, ['host-acquisition-stopped']);
    fail = false;
    assert.deepEqual(await host.stopDashboard({ token }), { stopped: true });
    assert.equal((await start()).state, 'reading');
  } finally { fail = false; DashboardArchiveReader.prototype.close = close; await host.dispose(); await rm(root, { recursive: true, force: true }); }
});
