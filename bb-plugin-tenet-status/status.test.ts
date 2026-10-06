import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { FixtureArchiveWriter as ArchiveWriter } from '../test/archive-fixture.js';
import hostEntry from './host.js';
import plugin from './server.js';
import type { Status } from './contract.js';

const threadId = 'thr_abcdefgh1234', otherId = 'thr_wxyzabcd1234';
const hostId = 'host_abcdefgh1234';

test('synthetic archive through host and BB RPC keeps linked FAIL, pass, history and unmonitored threads separate', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bb-host-')));
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const append = (id: string, link: string | undefined, outcome: 'PASS' | 'FAIL') => {
    const sink = writer.bindHistorical({ sessionId: 'same-pi-session', invocationId: id, callId: id, toolName: 'edit', cwd: '/tmp',
      mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: link }, 4);
    sink('begin', { policy: { rules: [{ id: 'r1', text: '<img src=x onerror=alert(1)>', line: 8, enforcement: 'BLOCK' }] },
      action: 'secret-bearing-action' });
    sink('request', { payload: { model: 'fixture', state: { action: {}, policy: {}, context: {}, trajectory: {}, integrity: {} },
      questions: {}, secret: 'secret-bearing-action' }, policy: { rules: [{ id: 'r1', text: '<img src=x onerror=alert(1)>', line: 8, enforcement: 'BLOCK' }] }, questionVersion: 'v1', mapping: [] });
    sink('validation', { valid: true });
    sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r1', outcome: { choice: outcome, probabilities: { FAIL: 0.92 } } }] } });
    sink('decision', { decision: outcome === 'FAIL' ? 'BLOCK' : 'ALLOW' });
    sink('permission', { outcome: 'released' });
  };
  append('flagged', threadId, 'FAIL'); append('passing', threadId, 'PASS'); append('historical', undefined, 'FAIL'); append('unrelated', otherId, 'FAIL');
  await writer.complete();
  const host = experimental_createHostEntryHarness(hostEntry);
  let calls = 0;
  const fake = createFakePluginHost({ pluginId: 'tenet-status', settings: { recordingDirectories: JSON.stringify({ [hostId]: root }) },
    sdk: { threads: { get: async ({ threadId: id }: any) => ({ id, providerId: id === otherId ? 'codex' : 'pi', environmentId: 'env_fixture' }) as any },
      environments: { get: async () => ({ id: 'env_fixture', hostId }) as any } },
    experimental_callHostRpc: async ({ method, input, hostId: selected }: any) => {
      calls++;
      assert.equal(selected, hostId);
      assert.equal(method, 'readStatus');
      return host.experimental_call('readStatus', input);
    } });
  try {
    await plugin(fake.bb);
    const linked = await fake.harness.behavior.callRpc('status', { threadId }) as Status;
    assert.equal(linked.coverage, 'partial');
    assert.equal(linked.linkedCalls, 2);
    assert.equal(linked.failures, 1);
    assert.deepEqual(Object.keys(linked).sort(), ['coverage', 'failures', 'issues', 'linkedCalls', 'notices']);
    assert.ok(!JSON.stringify(linked).includes('secret-bearing-action'));
    assert.ok(!JSON.stringify(linked).includes('<img'));
    const unmonitored = await fake.harness.behavior.callRpc('status', { threadId: 'thr_000000001234' }) as Status;
    assert.equal(unmonitored.coverage, 'unknown');
    assert.equal(unmonitored.failures, 0);
    const nonPi = await fake.harness.behavior.callRpc('status', { threadId: otherId }) as Status;
    assert.equal(nonPi.coverage, 'unavailable');
    assert.equal(calls, 2);
    await assert.rejects(fake.harness.behavior.callRpc('status', { threadId, hostId } as any));
    await assert.rejects(fake.harness.behavior.callRpc('status', { threadId, cursor: 'page-2' } as any));
    await assert.rejects(fake.harness.behavior.callRpc('status', { threadId: 'bad' }));
  } finally {
    await fake.harness.lifecycle.dispose(); await host.experimental_dispose(); await rm(root, { recursive: true, force: true });
  }
});

test('unsafe archive cannot become green, and host rejects arbitrary relative recording paths', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bb-unsafe-')));
  const host = experimental_createHostEntryHarness(hostEntry);
  try {
    assert.equal((await host.experimental_call('readStatus', { threadId, recordingDirectory: 'relative' })).coverage, 'unavailable');
    const archive = join(root, 'archive');
    await symlink('/etc', archive);
    assert.equal((await host.experimental_call('readStatus', { threadId, recordingDirectory: archive })).coverage, 'unavailable');
  } finally { await host.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
});
