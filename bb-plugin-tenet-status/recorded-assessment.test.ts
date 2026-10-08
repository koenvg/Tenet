import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { inconsistentAssessmentCalls, recordedAssessmentThread as threadId, recordedAssessmentSentinel as sentinel,
  recordedFailureThread, writeRecordedAssessmentFixture } from '../test/recorded-assessment-fixture.js';
import hostEntry from './host.js';
import plugin from './server.js';
import type { Status, Findings } from './contract.js';
import type { ThreadOverview } from '../src/inspector/bb-summary.js';

for (const schema of [3, 4, 5] as const) test(`schema-${schema} owner RPC excludes duplicate results in either order and preserves valid findings`, async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet77-rpc-'));
  const hostId = 'host_assessment77', host = experimental_createHostEntryHarness(hostEntry);
  const fake = createFakePluginHost({ pluginId: 'tenet-status', settings: { recordingDirectories: JSON.stringify({ [hostId]: root }) },
    sdk: { threads: { get: async () => ({ providerId: 'pi', environmentId: 'env_fixture77' }) as any },
      environments: { get: async () => ({ id: 'env_fixture77', hostId }) as any } },
    experimental_callHostRpc: async ({ method, input, hostId: selected }: any) => {
      assert.equal(selected, hostId);
      return host.experimental_call(method, input);
    } });
  try {
    await writeRecordedAssessmentFixture(root, schema);
    await plugin(fake.bb);
    const status = await fake.harness.behavior.callRpc('status', { threadId }) as Status;
    assert.equal(status.linkedCalls, 8);
    assert.equal(status.failures, 1);
    assert.equal(status.assessments?.incomplete, inconsistentAssessmentCalls.length);
    assert.ok(status.issues.includes('assessment-inconsistent'));
    const failureStatus = await fake.harness.behavior.callRpc('status', { threadId: recordedFailureThread }) as Status;
    assert.equal(failureStatus.linkedCalls, 2);
    assert.equal(failureStatus.assessments?.unavailable, 2);
    assert.equal(failureStatus.notices?.incomplete, 0);
    assert.ok(!failureStatus.issues.includes('assessment-inconsistent'));
    const failureFindings = await fake.harness.behavior.callRpc('findings', { threadId: recordedFailureThread }) as Findings;
    assert.deepEqual(failureFindings.items, []);
    assert.ok(!failureFindings.issues.includes('assessment-inconsistent'));
    const failureOverview = await fake.harness.behavior.callRpc('overview', { threadId: recordedFailureThread }) as ThreadOverview;
    assert.ok(!failureOverview.issues.includes('assessment-inconsistent'));
    for (const call of failureOverview.calls) {
      const detail = await fake.harness.behavior.callRpc('overview', { threadId: recordedFailureThread, sessionId: failureOverview.sessionId!, callId: call.id }) as ThreadOverview;
      assert.deepEqual(call.evaluatorState, { status: 'unavailable', reason: 'provider-error' });
      assert.deepEqual(detail.selected?.evaluatorState, call.evaluatorState);
      assert.ok(detail.selected?.rules.every(rule => rule.result === null));
    }
    const findings = await fake.harness.behavior.callRpc('findings', { threadId }) as Findings;
    assert.deepEqual(findings.items.map(item => item.callId), ['valid-fail']);
    assert.deepEqual(findings.assessments, status.assessments);
    assert.equal(findings.next, null);
    const overview = await fake.harness.behavior.callRpc('overview', { threadId }) as ThreadOverview;
    assert.equal(overview.failures, 1);
    for (const callId of ['fail-pass', 'pass-fail']) {
      const call = overview.calls.find(call => call.callId === callId)!;
      const detail = await fake.harness.behavior.callRpc('overview', { threadId, sessionId: overview.sessionId!, callId: call.id }) as ThreadOverview;
      assert.equal(call.evaluatorState?.status, 'incomplete');
      assert.equal(detail.selected?.evaluatorState?.status, 'incomplete');
      assert.ok(detail.selected?.rules.every(rule => rule.result === null));
      assert.ok(!JSON.stringify(detail).includes(sentinel));
    }
    assert.ok(!JSON.stringify([status, findings, overview]).includes(sentinel));
  } finally {
    await fake.harness.lifecycle.dispose(); await host.experimental_dispose(); await rm(root, { recursive: true, force: true });
  }
});
