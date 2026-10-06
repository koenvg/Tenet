import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { FixtureArchiveWriter as ArchiveWriter } from '../test/archive-fixture.js';
import { validRecord } from '../src/recording/contract.js';
import hostEntry from './host.js';
import plugin from './server.js';
import type { Status, Findings } from './contract.js';

const local = 'host_local0001234', remote = 'host_remote001234';
const localThread = 'thr_local0001234', remoteThread = 'thr_remote001234';
async function append(root: string, threadId: string, id: string, choice: string, options: { integrity?: boolean; text?: string; gates?: string[] } = {}) {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const ruleId = options.integrity ? 'integrity' : 'r1';
  const policy = { rules: [{ id: 'r1', text: options.text ?? 'Do not edit secrets', line: 1, enforcement: 'WARN' }] };
  const integrity = { id: 'integrity', text: 'Do not weaken the policy' };
  const sink = writer.bindHistorical({ sessionId: 'session', invocationId: id, callId: id, toolName: 'edit', cwd: '/tmp', mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: threadId }, 4);
  sink('begin', { policy, integrity, config: { effectThreshold: 0.85 }, action: 'PRIVATE ACTION' });
  sink('request', { policy, questionVersion: 'v1', mapping: [{ id: ruleId, outcomeKey: 'outcome', evidenceKey: 'evidence' }],
    payload: { model: 'fixture', questions: {}, state: { action: { text: 'PRIVATE ACTION' }, policy, context: {}, trajectory: {}, integrity }, evidence: 'PRIVATE EVIDENCE' } });
  sink('validation', { valid: true });
  sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId, outcome: { choice, probabilities: { [choice]: 0.6 } } }] } });
  sink('decision', { decision: 'BLOCK', contributions: [{ ruleId, outcome: choice, gates: options.gates ?? [] }] });
  sink('permission', { outcome: 'released' });
  await writer.complete();
  const paths = (await readdir(root, { recursive: true })).filter(path => path.endsWith('.json'));
  const records = await Promise.all(paths.map(async path => JSON.parse(await readFile(join(root, path), 'utf8'))));
  const request = records.find(record => record.invocationId === id && record.stage === 'request');
  assert.ok(validRecord(request), 'the evidence-bearing request must survive archive validation');
  assert.equal((request.data.payload as { evidence?: unknown }).evidence, 'PRIVATE EVIDENCE');
}

test('local and remote routing: live appends, custom archive, grouping identity, disconnect and archive loss', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-live-')));
  const roots = { [local]: join(root, 'local-custom'), [remote]: join(root, 'remote-custom') };
  const reader = experimental_createHostEntryHarness(hostEntry);
  let disconnected = false;
  const routed: string[] = [];
  const fake = createFakePluginHost({ pluginId: 'tenet-status', settings: { recordingDirectories: JSON.stringify(roots) },
    sdk: { threads: { get: async ({ threadId }: any) => ({ id: threadId, providerId: 'pi', environmentId: threadId }) as any },
      environments: { get: async ({ environmentId }: any) => ({ id: environmentId, hostId: environmentId === localThread ? local : remote }) as any } },
    experimental_callHostRpc: async ({ method, input, hostId }: any) => {
      routed.push(hostId);
      assert.equal(input.recordingDirectory, roots[hostId as keyof typeof roots]);
      if (disconnected && hostId === remote) throw new Error('host disconnected');
      return reader.experimental_call(method, input);
    } });
  try {
    await plugin(fake.bb);
    await append(roots[local], localThread, 'pass', 'PASS');
    await append(roots[remote], remoteThread, 'approval', 'APPROVAL_REQUIRED');
    await append(roots[remote], remoteThread, 'unknown', 'UNKNOWN', { gates: ['outcome-unknown', 'evidence-insufficient'] });
    const status = (threadId: string) => fake.harness.behavior.callRpc('status', { threadId }) as Promise<Status>;
    assert.equal((await status(localThread)).failures, 0);
    const initial = await status(remoteThread);
    assert.equal(initial.failures, 0, 'counterfactual BLOCK, approvals and gates are not FAIL');
    assert.deepEqual(initial.notices, { approvals: 1, uncertain: 1, incomplete: 0 });
    await append(roots[remote], remoteThread, 'warn-1', 'FAIL');
    await append(roots[remote], remoteThread, 'warn-2', 'FAIL');
    await append(roots[remote], remoteThread, 'integrity', 'FAIL', { integrity: true });
    await append(roots[remote], remoteThread, 'changed-policy', 'FAIL', { text: 'New policy text' });
    assert.equal((await status(remoteThread)).failures, 4);
    assert.equal((await status(localThread)).failures, 0, 'remote records do not leak into local thread');
    const details = await fake.harness.behavior.callRpc('findings', { threadId: remoteThread }) as Findings;
    const a = details.items.find(item => item.callId === 'warn-1')!;
    const b = details.items.find(item => item.callId === 'warn-2')!;
    assert.equal(a.snapshot, b.snapshot);
    assert.notEqual(a.snapshot, details.items.find(item => item.callId === 'changed-policy')!.snapshot);
    assert.ok(a.rules[0]!.uncertain);
    assert.equal(details.items.find(item => item.callId === 'integrity')!.rules[0]!.kind, 'integrity');
    assert.ok(!JSON.stringify(details).includes('PRIVATE'));
    assert.ok(!details.issues.includes('corrupt-record'), 'all written stages must be readable');
    disconnected = true;
    assert.equal((await status(remoteThread)).coverage, 'unavailable');
    disconnected = false;
    await rm(roots[remote], { recursive: true });
    assert.equal((await status(remoteThread)).coverage, 'unavailable');
    assert.equal((await fake.harness.behavior.callRpc('findings', { threadId: remoteThread }) as Findings).coverage, 'unavailable');
    assert.ok(routed.includes(local) && routed.includes(remote));
  } finally { await fake.harness.lifecycle.dispose(); await reader.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
});
