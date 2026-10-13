import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { captureAction } from '../src/decision/evidence.js';
import { prepareJudgeScopes } from '../src/decision/judge-evidence.js';
import { Observations } from '../src/decision/trajectory.js';
import { readArchive } from '../src/recording/archive.js';
import { validRecord } from '../src/recording/contract.js';
import { APUS_V2 } from '../src/recording/native.js';
import { captureScopedPlan, captureScopedSubmission } from '../src/recording/scoped-capture.js';
import { invocationView } from '../src/inspector/view.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { scopedFixture, scopedIdentity } from './scoped-recording-fixture.js';

for (const native of [false, true]) test(`scoped ${native ? 'APUS' : 'JEV'} archive preserves proposed and previous JSON arguments`, async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet108-json-'));
  try {
    const fixture = await scopedFixture();
    for (const [index, args] of [['synthetic'], 'synthetic', null, 42, true, false].entries()) {
      const observations = new Observations(fixture.request.action.sessionId);
      observations.addHistory([{ kind: 'tool-call', callId: 'previous', toolName: 'read', data: args, timestamp: 9999 }]);
      const request = { ...fixture.request, action: captureAction({ sessionId: fixture.request.action.sessionId,
        callId: fixture.request.action.callId, toolName: 'read', arguments: args }), trajectory: observations.snapshot() };
      const plan = prepareJudgeScopes(request)!;
      const directory = join(root, String(index)), writer = new FixtureArchiveWriter({ enabled: true, directory });
      const sink = writer.bind(scopedIdentity);
      captureScopedPlan(sink, request, plan, fixture.questions, { provider: native ? 'apus-llamacpp' : 'typesafe', model: 'offline',
        ...(native ? { nativeContract: APUS_V2 } : {}) });
      const group = plan.groups[0]!;
      captureScopedSubmission(sink, { submissionId: group.id, scopeId: group.id, status: 'attempted', questionKeys: group.questionKeys,
        payloadJson: JSON.stringify({ model: 'offline', state: group.state,
          questions: Object.fromEntries(group.questionKeys.map(k => [k, fixture.questions[k]])) }) });
      await writer.complete();
      const archive = await readArchive(directory);
      assert.deepEqual(archive.issues, []);
      assert.equal(archive.records.length, 2, `request and attempt must be captured for ${JSON.stringify(args)}`);
      assert.ok(archive.records.every(validRecord));
      const view = invocationView(archive.records), state = view.inputScopes[0]!.state as any;
      assert.equal(view.inputLayout, 'scoped');
      assert.deepEqual(state.proposedToolCall.arguments, args);
      assert.deepEqual(state.previousToolCall.arguments, args);
      assert.deepEqual((view.submissions[0] as any).payload.state, state);
      assert.equal(view.submissions[0]!.status, 'attempted');
      assert.equal(view.execution, 'unknown');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unavailable archive snapshot dominates retained attempted input in the inspector', async () => {
  const directory = await realpath(await mkdtemp('/tmp/tenet108-unavailable-'));
  try {
    const { request, plan, questions } = await scopedFixture();
    const writer = new FixtureArchiveWriter({ enabled: true, directory }), record = writer.bind(scopedIdentity);
    const sink: typeof record = (stage, data) => record(stage, stage === 'response' ? { ...data, unavailable: true } : data);
    captureScopedPlan(sink, request, plan, questions, { provider: 'typesafe', model: 'offline' });
    const group = plan.groups[0]!;
    captureScopedSubmission(sink, { submissionId: group.id, scopeId: group.id, status: 'attempted', questionKeys: group.questionKeys,
      payloadJson: JSON.stringify({ model: 'offline', state: group.state,
        questions: Object.fromEntries(group.questionKeys.map(k => [k, questions[k]])) }) });
    await writer.complete();
    const archive = await readArchive(directory);
    assert.deepEqual(archive.issues, []);
    assert.ok(archive.records.every(validRecord));
    assert.equal(archive.records[1]!.data.unavailable, true);
    const view = invocationView(archive.records);
    assert.equal(view.submissions[0]!.status, 'unavailable');
    assert.ok(!('payload' in view.submissions[0]!));
    assert.equal(view.requestStatus, 'prepared scopes captured; submission unavailable');
    assert.equal(view.execution, 'unknown');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
