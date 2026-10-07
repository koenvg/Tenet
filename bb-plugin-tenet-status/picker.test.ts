import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from './server.js';
import { pickerMethods, type ProjectPage, type ThreadPage, type PickerSelection } from './picker-contract.js';
import { parseMainRoute, overviewPath } from './main-route.js';

const projectId = 'proj_fixture0001', other = 'proj_fixture0002', threadId = 'thr_fixture00001';
const projects = Array.from({ length: 102 }, (_, n) => ({ id: `proj_${String(n).padStart(12, '0')}`, name: 'p'.repeat(400) }));
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
test('public picker RPC pages allowlisted metadata without any environment, settings or archive read', async () => {
  const queries: any[] = [];
  const fake = createFakePluginHost({ pluginId: 'tenet-status', sdk: {
    projects: { list: async (args: any) => { assert.deepEqual(args, { includePersonal: true }); return projects as any; },
      get: async ({ projectId }: any) => ({ id: projectId, name: 'Fixture project', sourcePath: 'RAW-SENTINEL' }) as any },
    threads: {
      list: async (args: any) => {
        queries.push(args);
        const row = (n: number, providerId: string) => ({ id: `thr_${String(n).padStart(12, '0')}`, providerId, projectId,
          title: 't'.repeat(400), runtime: { displayStatus: 'idle' }, deletedAt: null, archivedAt: args.archived ? 1 : null,
          environmentHostId: 'RAW-SENTINEL', environmentPath: 'RAW-SENTINEL' });
        return args.archived ? [row(100, 'pi')] : args.offset === 0 ? Array.from({ length: 50 }, (_, n) => row(n, 'codex')) : [row(51, 'pi'), row(52, 'pi')];
      },
      get: async ({ threadId: id }: any) => ({ id, providerId: id === 'thr_nonpi000001' ? 'codex' : 'pi', projectId,
        title: 'Stopped fixture', status: 'idle', archivedAt: null, deletedAt: id === 'thr_deleted0001' ? 1 : null }) as any,
    },
  }, experimental_callHostRpc: async () => { throw new Error('Archive must not be read'); } });
  plugin(fake.bb);
  try {
    const first = await fake.harness.behavior.callRpc('pickerProjects', {}) as ProjectPage;
    const second = await fake.harness.behavior.callRpc('pickerProjects', { cursor: first.next }) as ProjectPage;
    const third = await fake.harness.behavior.callRpc('pickerProjects', { cursor: second.next }) as ProjectPage;
    assert.deepEqual([first.items.length, second.items.length, third.items.length], [50, 50, 2]);
    assert.equal(first.items[0]!.label.length, 256); assert.equal(third.next, null);
    assert.equal(new Set([...first.items, ...second.items, ...third.items].map(p => p.id)).size, 102);
    const window = await fake.harness.behavior.callRpc('pickerThreads', { projectId }) as ThreadPage;
    assert.equal(window.items.length, 0); assert.ok(window.next);
    const pi = await fake.harness.behavior.callRpc('pickerThreads', { projectId, cursor: window.next }) as ThreadPage;
    assert.equal(pi.items.length, 2); assert.equal(pi.items[0]!.label.length, 256);
    const archived = await fake.harness.behavior.callRpc('pickerThreads', { projectId, cursor: pi.next }) as ThreadPage;
    assert.equal(archived.items.length, 1); assert.equal(archived.items[0]!.archived, true); assert.equal(archived.next, null);
    assert.deepEqual(queries, [
      { projectId, includeHidden: true, archived: false, limit: 50, offset: 0 },
      { projectId, includeHidden: true, archived: false, limit: 50, offset: 50 },
      { projectId, includeHidden: true, archived: true, limit: 50, offset: 0 },
    ]);
    const selected = await fake.harness.behavior.callRpc('pickerSelection', { threadId, projectId }) as PickerSelection;
    assert.equal(selected.state, 'ready'); assert.equal(selected.thread!.status, 'idle');
    for (const [input, state] of [[{ threadId, projectId: other }, 'scope-changed'], [{ threadId: 'thr_nonpi000001' }, 'unsupported'],
      [{ threadId: 'thr_deleted0001' }, 'unavailable']] as const)
      assert.equal((await fake.harness.behavior.callRpc('pickerSelection', input) as PickerSelection).state, state);
    assert.ok(!JSON.stringify([first, pi, selected]).includes('RAW-SENTINEL'));
    for (const input of [{ projectId, cursor: 'x'.repeat(513) }, { projectId, hostId: 'host_fixture0001' }, { projectId, limit: 500 },
      { projectId, recordingDirectory: '/tmp' }, { projectId, cursor: first.next }, { projectId: other, cursor: window.next },
      { projectId, cursor: b64({ kind: 'threads', projectId, offset: -1, archived: false }) }])
      await assert.rejects(fake.harness.behavior.callRpc('pickerThreads', input as any));
    for (const key of Object.keys(pickerMethods)) await assert.rejects(fake.harness.behavior.callRpc(key, { threadId, projectId, raw: 'forbidden' }));
  } finally { await fake.harness.lifecycle.dispose(); }
});
test('main routes round-trip bounded opaque selection, preserve old findings links, and reject raw/path selectors', () => {
  const selection = { sessionId: 'a'.repeat(64), callId: 'b'.repeat(64), category: 'unavailable' as const };
  assert.deepEqual(parseMainRoute(overviewPath(threadId, selection, projectId)), { kind: 'overview', projectId, threadId, selection });
  assert.deepEqual(parseMainRoute(`overview/${threadId}`), { kind: 'overview', projectId: undefined, threadId, selection: {} });
  assert.deepEqual(parseMainRoute(threadId), { kind: 'findings', threadId });
  assert.deepEqual(parseMainRoute(''), { kind: 'projects' });
  assert.deepEqual(parseMainRoute(`project/${projectId}`), { kind: 'threads', projectId });
  for (const path of [`overview/${threadId}/call/${selection.callId}`, `overview/${threadId}/session/native`,
    `overview/${threadId}/category/pass`, `overview/${threadId}/session/${selection.sessionId}/host/host_fixture0001`,
    `overview/${threadId}?recordingDirectory=/tmp`, `project/${projectId}/overview/${threadId}/category/`, 'x'.repeat(513)])
    assert.equal(parseMainRoute(path).kind, 'invalid', path);
});
