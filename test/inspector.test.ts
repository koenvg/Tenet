import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveWriter } from '../src/recording/archive.js';
import { startInspector } from '../src/inspector/server.js';

test('independent server reads retained records without authentication and keeps Host/Origin checks and read-only routing', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'tenet-inspector-')));
  const writer = new ArchiveWriter({ enabled: true, directory: dir });
  const sink = writer.bind({ sessionId: '../../s', invocationId: 'one', callId: 'c', toolName: 'edit', mode: 'observe', cwd: '/project' });
  sink('begin', { policy: { rules: [{ id: 'r', text: '<script>alert(1)</script>', line: 1, enforcement: 'BLOCK' }] } });
  sink('decision', { decision: 'BLOCK', reason: 'rule-failed' });
  sink('permission', { outcome: 'released' });
  await writer.close();
  const app = await startInspector({ directory: dir });
  try {
    const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => fetch(`${app.origin}${path}`, { method, headers });
    assert.equal(app.url, `${app.origin}/`);
    assert.equal((await fetch(`${app.origin}/api/sessions`)).status, 200);
    assert.equal((await get('/api/sessions', { Origin: 'https://hostile.example' })).status, 403);
    assert.equal((await get('/api/sessions', { Host: 'hostile.example' })).status, 403);
    assert.equal((await get('/api/sessions', {}, 'POST')).status, 405);
    assert.equal((await get('/api/file?path=/etc/passwd')).status, 404);
    const response = await get('/api/sessions');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const index: any = await response.json();
    assert.equal(index.sessions[0].sessionId, '../../s');
    const session = index.sessions[0].id;
    const invocations: any = await (await get(`/api/sessions/${session}`)).json();
    const invocation = invocations.invocations[0].id;
    const detail: any = await (await get(`/api/sessions/${session}/invocations/${invocation}`)).json();
    assert.equal(detail.view.rules[0].text, '<script>alert(1)</script>');
    assert.equal(detail.view.permission, 'released'); assert.equal(detail.view.execution, 'unknown');
    assert.equal(detail.view.evidence, null);
    assert.ok(detail.view.missing.includes('request'));
    assert.equal((await get(`/api/sessions/${'a'.repeat(64)}/invocations/${invocation}`)).status, 404);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
