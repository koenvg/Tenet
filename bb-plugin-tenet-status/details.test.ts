import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { ArchiveWriter } from '../src/recording/archive.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readPrivateFile } from '../src/recording/files.js';
import { recordSessionKey, recordInvocationKey } from '../src/recording/archive.js';
import hostEntry from './host.js';
import plugin from './server.js';

const threadId = 'thr_abcdefgh1234', otherId = 'thr_wxyzabcd1234', hostId = 'host_abcdefgh1234';

test('owner details paginate only validated linked selected FAILs and project no raw actions', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-bb-details-')));
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const append = (id: string, link: string | undefined, choice: 'FAIL' | 'PASS', valid = true) => {
    const sink = writer.bind({ sessionId: 'session', invocationId: id, callId: id, toolName: 'edit', cwd: '/tmp',
      mode: 'observe', host: 'pi', contextId: 'main', bbThreadId: link });
    const policy = { rules: [{ id: 'r1', text: '<img src=x onerror=alert(1)>', line: 8, enforcement: 'WARN' }] };
    sink('begin', { policy: { rules: [{ ...policy.rules[0], text: 'old policy' }] }, action: 'secret-bearing-action' });
    sink('request', { payload: { model: 'fixture', state: { action: {}, policy: {}, context: {}, trajectory: {}, integrity: {} },
      questions: {}, secret: 'secret-bearing-action' }, policy, questionVersion: 'v1', mapping: [] });
    sink('validation', { valid });
    sink('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r1', outcome: { choice, probabilities: { FAIL: 0.72 } } }] } });
    sink('decision', { decision: 'ALLOW' });
    sink('permission', { outcome: 'released' });
    sink('execution', { outcome: 'executed' });
  };
  for (let n = 0; n < 7; n++) append(`flagged-${n}`, threadId, 'FAIL');
  append('passing', threadId, 'PASS'); append('invalid', threadId, 'FAIL', false);
  append('historical', undefined, 'FAIL'); append('other-thread', otherId, 'FAIL');
  await writer.close();
  const host = experimental_createHostEntryHarness(hostEntry);
  const fake = createFakePluginHost({ pluginId: 'tenet-status', settings: { recordingDirectories: JSON.stringify({ [hostId]: root }) },
    sdk: { threads: { get: async ({ threadId: id }: any) => ({ id, providerId: id === otherId ? 'codex' : 'pi', environmentId: 'env_fixture' }) as any },
      environments: { get: async () => ({ id: 'env_fixture', hostId }) as any } },
    experimental_callHostRpc: async ({ method, input, hostId: selected }: any) => {
      assert.equal(selected, hostId); return host.experimental_call(method, input);
    } });
  try {
    await plugin(fake.bb);
    const first: any = await fake.harness.behavior.callRpc('findings', { threadId });
    assert.equal(first.coverage, 'partial'); assert.equal(first.linkedCalls, 9);
    assert.equal(first.items.length, 5); assert.ok(first.next);
    const second: any = await fake.harness.behavior.callRpc('findings', { threadId, cursor: first.next });
    assert.equal(second.items.length, 2); assert.equal(second.next, null);
    assert.deepEqual([...first.items, ...second.items].map(item => item.callId).sort(), Array.from({ length: 7 }, (_, n) => `flagged-${n}`));
    const item = first.items[0];
    assert.deepEqual(item.rules, [{ ruleId: 'r1', severity: 'WARN', policyText: '<img src=x onerror=alert(1)>', confidence: 0.72 }]);
    assert.equal(item.wouldDecision, 'ALLOW'); assert.equal(item.actualPermission, 'released'); assert.equal(item.observedExecution, 'executed');
    assert.ok(item.missingStages.includes('response'));
    assert.ok(!JSON.stringify(first).includes('secret-bearing-action'));
    assert.ok(!JSON.stringify(first).includes('old policy'));
    const unknown: any = await fake.harness.behavior.callRpc('findings', { threadId: 'thr_000000001234' });
    assert.equal(unknown.coverage, 'unknown'); assert.deepEqual(unknown.items, []);
    const nonPi: any = await fake.harness.behavior.callRpc('findings', { threadId: otherId });
    const address = { schemaVersion: 3, host: 'pi', contextId: 'main', sessionId: 'session', invocationId: 'flagged-0' };
    let loseRequest = false;
    const flaky = new ArchiveIndex(root, async (archive, path) => {
      const text = await readPrivateFile(archive, path);
      const record = JSON.parse(text);
      if (loseRequest && record.invocationId === 'flagged-0' && record.stage === 'request') throw new Error('vanished-request');
      return text;
    });
    await flaky.refresh();
    const originalIssues = flaky.issues.bind(flaky);
    (flaky as any).issues = (session?: string) => [...originalIssues(session), ...(session
      ? [{ session, file: 'unrelated.json', reason: 'record-unavailable' }] : [])];
    const safeFirst = await flaky.threadFindings(threadId);
    const safeSecond = await flaky.threadFindings(threadId, safeFirst.next!);
    assert.equal([...safeFirst.items, ...safeSecond.items].length, 7, 'an unrelated session issue must not hide a call');
    assert.ok(!safeFirst.issues.includes('detail-unavailable'), 'session-wide issues are not this call failing');
    loseRequest = true;
    const missing = await flaky.detail(recordSessionKey(address), recordInvocationKey(address), threadId);
    assert.ok(missing.readIssues.some(issue => issue.reason === 'record-unavailable'));
    const brokenFirst = await flaky.threadFindings(threadId);
    const brokenSecond = await flaky.threadFindings(threadId, brokenFirst.next!);
    const brokenItems = [...brokenFirst.items, ...brokenSecond.items];
    assert.equal(brokenItems.length, 6);
    assert.ok(!brokenItems.some(item => item.callId === 'flagged-0'));
    assert.ok(!JSON.stringify(brokenItems).includes('old policy'));
    assert.ok([...brokenFirst.issues, ...brokenSecond.issues].includes('detail-unavailable'));
    const index = new ArchiveIndex(root); await index.refresh();
    const original = (index as any).allEntries.bind(index);
    let fullScans = 0;
    (index as any).allEntries = function* () { fullScans++; yield* original(); };
    await index.threadFindings(threadId);
    assert.equal(fullScans, 1, 'one metadata pass per findings page, not per candidate');
    (index as any).allEntries = () => { throw new Error('detail must not scan the full index'); };
    assert.ok((await index.detail(recordSessionKey(address), recordInvocationKey(address), threadId)).records.length);
    assert.equal(nonPi.coverage, 'unavailable');
    await assert.rejects(fake.harness.behavior.callRpc('findings', { threadId, cursor: 'not-a-cursor' }));
    await assert.rejects(fake.harness.behavior.callRpc('findings', { threadId, hostId } as any));
  } finally { await fake.harness.lifecycle.dispose(); await host.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
});
