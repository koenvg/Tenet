import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { evaluatorThreadId as threadId, evaluatorSentinel, writeProviderErrorFixture } from '../test/evaluator-state-fixture.js';
import { findingsSchema, statusSchema } from './contract.js';
import hostEntry from './host.js';
import plugin from './server.js';

const hostId = 'host_abcdefgh1234';
const expected = { completed: 0, unavailable: 2, pending: 0, dropped: 0, cancelled: 0, incomplete: 0,
  reasons: [{ code: 'provider-error', count: 2 }] };

test('owner and host RPC report two terminal evaluator failures without transporting provider bodies', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-evaluator-rpc-')));
  const host = experimental_createHostEntryHarness(hostEntry);
  const fake = createFakePluginHost({ pluginId: 'tenet-status', settings: { recordingDirectories: JSON.stringify({ [hostId]: root }) },
    sdk: { threads: { get: async ({ threadId: id }: any) => ({ id, providerId: 'pi', environmentId: 'env_fixture' }) as any },
      environments: { get: async () => ({ id: 'env_fixture', hostId }) as any } },
    experimental_callHostRpc: async ({ method, input, hostId: selected }: any) => {
      assert.equal(selected, hostId); return host.experimental_call(method, input);
    } });
  try {
    await writeProviderErrorFixture(root);
    // An unreadable archive record must not hide the selected thread's evaluator failures.
    const folder = (await readdir(root))[0]!;
    await writeFile(join(root, folder, 'synthetic-corrupt.json'), '{', { mode: 0o600 });
    await plugin(fake.bb);
    const status: any = await fake.harness.behavior.callRpc('status', { threadId });
    const findings: any = await fake.harness.behavior.callRpc('findings', { threadId });
    assert.equal(status.coverage, 'partial');
    assert.equal(status.linkedCalls, 2);
    assert.equal(status.failures, 0);
    assert.deepEqual(status.assessments, expected);
    assert.deepEqual(findings.assessments, expected);
    assert.deepEqual(findings.items, []);
    assert.equal(findings.next, null);
    assert.ok(status.issues.includes('corrupt-record'));
    assert.ok(findings.issues.includes('corrupt-record'));
    assert.ok(!status.issues.includes('missing-stages'));
    assert.equal(status.notices.incomplete, 0);
    assert.ok(!JSON.stringify([status, findings]).includes(evaluatorSentinel));
    const unrelated: any = await fake.harness.behavior.callRpc('status', { threadId: 'thr_unlinked1234' });
    assert.equal(unrelated.linkedCalls, 0);
    assert.equal(unrelated.assessments.unavailable, 0);
    await rm(root, { recursive: true, force: true });
    assert.equal((await fake.harness.behavior.callRpc('status', { threadId }) as any).coverage, 'unavailable');
    assert.equal((await fake.harness.behavior.callRpc('findings', { threadId }) as any).coverage, 'unavailable');
  } finally {
    await fake.harness.lifecycle.dispose(); await host.experimental_dispose(); await rm(root, { recursive: true, force: true });
  }
});

test('assessment RPC fields reject arbitrary reasons, unbounded lists, negative counts and extra source fields', () => {
  const status = { coverage: 'partial', linkedCalls: 2, failures: 0, issues: [], assessments: expected };
  assert.ok(statusSchema.safeParse(status).success);
  for (const assessments of [
    { ...expected, reasons: [{ code: evaluatorSentinel, count: 2 }] },
    { ...expected, reasons: Array.from({ length: 21 }, () => ({ code: 'provider-error', count: 1 })) },
    { ...expected, unavailable: -1 },
    { ...expected, providerBody: evaluatorSentinel },
    { ...expected, reasons: [{ code: 'provider-error', count: 2, message: evaluatorSentinel }] },
  ]) {
    assert.equal(statusSchema.safeParse({ ...status, assessments }).success, false);
    assert.equal(findingsSchema.safeParse({ coverage: 'partial', linkedCalls: 2, issues: [], items: [], next: null, assessments }).success, false);
  }
});
