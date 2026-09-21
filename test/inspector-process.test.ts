import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startInspector } from '../src/inspector/server.js';
import { sessionKey } from '../src/recording/archive.js';

function writer(root: string, sessionId: string, project: string, prefix: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['-e', `
      import { ArchiveWriter } from './src/recording/archive.ts';
      const [directory, encodedSession, cwd, prefix] = process.argv.slice(1);
      const sessionId = JSON.parse(encodedSession);
      const writer = new ArchiveWriter({ enabled: true, directory });
      for (let n = 0; n < 12; n++) {
        const sink = writer.bind({ sessionId, cwd, invocationId: prefix + n, callId: 'reused', toolName: 'edit', mode: 'observe' });
        sink('begin', { policy: { rules: [], marker: prefix } });
        sink('decision', { decision: n % 2 ? 'ASK' : 'ALLOW' });
      }
      if (!await writer.close() || writer.health().written !== 24) process.exit(1);
    `, root, JSON.stringify(sessionId), project, prefix], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = ''; child.stderr.on('data', chunk => { error += chunk; });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(error || `Writer exit ${code}`)));
  });
}

test('separate concurrent processes, reopen, resume and forks remain distinct through paginated APIs', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-process-')));
  const session = '../ 雪 /?%#\u0000';
  let app: Awaited<ReturnType<typeof startInspector>> | undefined;
  try {
    await Promise.all([writer(root, session, '/project-a', 'a'), writer(root, session, '/project-a', 'b'), writer(root, 'other', '/project-b', 'c')]);
    app = await startInspector({ directory: root });
    const get = async (path: string) => { const response = await fetch(app!.origin + path); assert.equal(response.status, 200); return response.json() as Promise<any>; };
    const sessions = await get('/api/sessions?project=%2Fproject-a');
    assert.equal(sessions.sessions.length, 1); assert.equal(sessions.sessions[0].sessionId, session);
    assert.equal(sessions.sessions[0].invocations, 24); assert.equal(sessions.sessions[0].concerns, 12);
    const first = await get('/api/sessions?limit=1');
    const second = await get(`/api/sessions?limit=1&cursor=${first.next}`);
    assert.notEqual(first.sessions[0].id, second.sessions[0].id); assert.equal(second.next, null);
    assert.equal((await fetch(app.origin + '/api/sessions?cursor=malformed')).status, 400);
    assert.equal((await fetch(app.origin + `/api/sessions?project=/project-a&cursor=${first.next}`)).status, 400);
    assert.equal((await fetch(app.origin + '/api/sessions?limit=101')).status, 400);
    await app.close();
    await Promise.all([writer(root, session, '/project-a', 'resume'), writer(root, 'fork', '/project-a', 'fork')]);
    app = await startInspector({ directory: root });
    const retained = await get('/api/sessions?project=%2Fproject-a');
    assert.equal(retained.sessions.length, 2);
    assert.equal(retained.sessions.find((s: any) => s.sessionId === session).invocations, 36);
    let cursor: string | null = null;
    const ids = new Set<string>();
    do {
      const page = await get(`/api/sessions/${sessionKey(session)}?limit=7${cursor ? `&cursor=${cursor}` : ''}`);
      assert.ok(page.invocations.length <= 7);
      for (const call of page.invocations) {
        assert.ok(!ids.has(call.id)); ids.add(call.id);
        const detail = await get(`/api/sessions/${sessionKey(session)}/invocations/${call.id}`);
        assert.equal(detail.view.identity.sessionId, session); assert.equal(detail.view.identity.callId, 'reused');
        assert.equal(detail.view.policy.marker, call.invocationId.replace(/\d+$/, ''), 'evidence belongs to the originating writer invocation');
        assert.ok(!detail.view.identity.invocationId.startsWith('fork'));
      }
      cursor = page.next;
    } while (cursor);
    assert.equal(ids.size, 36);
  } finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
});
