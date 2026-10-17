import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dashboardHost } from '../bb-plugin-tenet-status/dashboard-host.js';

const threadId = 'thr_fixture0001';
test('host Stop releases real admission without reopening or changing recorded replay', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-lifecycle-')));
  const host = dashboardHost();
  const start = () => host.readDashboard({ kind: 'start', threads: [threadId], qualification: 'a'.repeat(64), recordingDirectory: root });
  try {
    const chunks = await Promise.all(Array.from({ length: 4 }, start));
    assert.deepEqual(chunks.map(chunk => chunk.state), ['reading', 'reading', 'reading', 'reading']);
    assert.deepEqual((await start()).reasons, ['host-run-limit']);
    const token = chunks[0]!.next!;
    const recorded = await host.readDashboard({ kind: 'advance', token });
    const expected = structuredClone(recorded);
    assert.deepEqual(await (host as any).stopDashboard({ token }), { stopped: true });
    assert.deepEqual(await (host as any).stopDashboard({ token }), { stopped: true });
    recorded.reasons.push('caller-mutation');
    assert.deepEqual(await host.readDashboard({ kind: 'advance', token }), expected);
    assert.equal((await start()).state, 'reading');
    assert.deepEqual(await (host as any).stopDashboard({ token: 'unknown' }), { stopped: true });
  } finally { await host.dispose(); await rm(root, { recursive: true, force: true }); }
});
