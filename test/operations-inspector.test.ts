import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startInspector } from '../src/inspector/server.js';
import { OperationsRuntime } from '../src/runtime/operations.js';
import { diagnosticSafety } from '../src/runtime/diagnostic-safety.js';
import { ArchiveWriter } from '../src/recording/archive.js';

test('loopback GET validates Operations filters and joins exact recordings beyond archive page one', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'ops-http-'))), root = join(cwd, 'recordings');
  const config = { enabled: true, directory: root }, archive = new ArchiveWriter(config);
  const owner = new OperationsRuntime(config, () => diagnosticSafety([]));
  const id = { host: 'test', sessionId: 'session', contextId: 'main', invocationId: '00000000-0000-4000-8000-000000000001', callId: 'call', toolName: 'read', cwd, mode: 'enforce' as const };
  archive.bind(id)('execution', { outcome: 'unknown' }); await archive.drain();
  for (let i = 0; i < 55; i++) {
    archive.bind({ ...id, invocationId: `older-${i}`, callId: `older-${i}` })('execution', { outcome: 'unknown' }); await archive.drain();
  }
  const activity = owner.begin(id); activity.analyzing(); activity.settle('completed', 27); activity.permission('blocked'); await owner.flush();
  const server = await startInspector({ directory: root });
  try {
    const response = await fetch(`${server.origin}/api/operations?window=15`); assert.equal(response.status, 200);
    const view = await response.json();
    assert.deepEqual(view.analysis, { count: 1, mean: 27, p95: 27 });
    assert.equal(view.requests[0].recording, 'available');
    const address = view.requests[0].archive;
    const firstPage = await (await fetch(`${server.origin}/api/sessions/${address.session}`)).json();
    assert.equal(firstPage.invocations.some((r: { id: string }) => r.id === address.invocation), false);
    const detail = await fetch(`${server.origin}/api/sessions/${address.session}/invocations/${address.invocation}`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).view.identity.invocationId, id.invocationId);
    for (const query of ['window=7', 'project=/private', 'state=executing', 'limit=101', 'offset=-1', 'unknown=1', 'window=15&window=60'])
      assert.equal((await fetch(`${server.origin}/api/operations?${query}`)).status, 400);
    assert.equal((await fetch(`${server.origin}/api/operations`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${server.origin}/api/operations`, { headers: { Origin: 'https://evil.test' } })).status, 403);
    assert.equal((await fetch(`${server.origin}/api/operations?project=${'a'.repeat(64)}`)).status, 200);
    await writeFile(join(root, '.operations-v1', `${owner.snapshot().runtimeId}.json`), '{"version":9}', { mode: 0o600 });
  } finally { await server.close(); await owner.close(1000); await archive.close(); await rm(cwd, { recursive: true, force: true }); }
});
