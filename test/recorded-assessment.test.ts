import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { readArchive } from '../src/recording/archive.js';
import { readPrivateFile } from '../src/recording/files.js';
import { inconsistentAssessmentCalls, recordedAssessmentThread as thread, recordedAssessmentSentinel as sentinel,
  recordedFailureThread, writeRecordedAssessmentFixture } from './recorded-assessment-fixture.js';

for (const schema of [3, 4, 5] as const) test(`schema-${schema} public archive rejects inconsistent result identities before summary and detail caps`, async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet77-'));
  try {
    await writeRecordedAssessmentFixture(root, schema);
    const archive = await readArchive(root);
    assert.deepEqual(archive.issues, [], 'historical payloads remain readable without rewriting their contracts');
    assert.ok(archive.records.every(r => r.schemaVersion === schema));
    let reads = 0, damageFreshDetail = false;
    const index = new ArchiveIndex(root, async (directory, path) => {
      reads++;
      const text = await readPrivateFile(directory, path), record = JSON.parse(text);
      if (damageFreshDetail && record.callId === 'valid-fail' && record.stage === 'assessment') {
        const first = record.data.assessment.rules[0];
        record.data.assessment.rules.push({ ...first, outcome: { choice: 'PASS' } });
        return JSON.stringify(record);
      }
      return text;
    });
    await index.refresh();
    const scanned = reads, status = index.threadStatus(thread);
    assert.equal(reads, scanned, 'summary uses bounded metadata without evidence rereads');
    assert.equal(status.failures, 1);
    assert.equal(status.assessments.completed, 2);
    assert.equal(status.assessments.incomplete, inconsistentAssessmentCalls.length);
    assert.equal(status.notices.incomplete, inconsistentAssessmentCalls.length);
    assert.ok(status.issues.includes('assessment-inconsistent'));
    const failureStatus = index.threadStatus(recordedFailureThread);
    assert.equal(failureStatus.linkedCalls, 2);
    assert.equal(failureStatus.assessments.unavailable, 2);
    assert.equal(failureStatus.notices.incomplete, 0);
    assert.ok(!failureStatus.issues.includes('assessment-inconsistent'), 'null and omitted assessments are normal evaluator failures');
    const failureFindings = await index.threadFindings(recordedFailureThread);
    assert.deepEqual(failureFindings.items, []);
    assert.ok(!failureFindings.issues.includes('assessment-inconsistent'));
    const failureOverview = await index.threadOverview(recordedFailureThread);
    assert.ok(!failureOverview.issues.includes('assessment-inconsistent'));
    for (const call of failureOverview.calls) {
      const detail = await index.threadOverview(recordedFailureThread, { sessionId: failureOverview.sessionId!, callId: call.id });
      assert.deepEqual(call.evaluatorState, { status: 'unavailable', reason: 'provider-error' });
      assert.deepEqual(detail.selected?.evaluatorState, call.evaluatorState);
      assert.ok(detail.selected?.rules.every(rule => rule.result === null));
    }
    const findings = await index.threadFindings(thread);
    assert.deepEqual(findings.items.map(item => item.callId), ['valid-fail']);
    assert.deepEqual(findings.assessments, status.assessments);
    const overview = await index.threadOverview(thread);
    assert.equal(overview.failures, 1);
    for (const call of overview.calls) {
      const detail = await index.threadOverview(thread, { sessionId: overview.sessionId!, callId: call.id });
      const selected = detail.selected!;
      assert.equal(selected.permission, 'released');
      assert.equal(selected.execution, 'executed');
      if (inconsistentAssessmentCalls.includes(call.callId)) {
        assert.equal(call.evaluatorState?.status, 'incomplete');
        assert.deepEqual(call.categories, ['pending']);
        assert.equal(selected.evaluatorState?.status, 'incomplete');
        assert.ok(selected.rules.every(rule => rule.result === null && rule.gateIds === null));
        assert.equal(selected.noRulesClassifiedViolated, false);
        assert.ok(!selected.categories.includes('violation'));
      } else {
        assert.equal(selected.evaluatorState?.status, 'completed');
        assert.equal(selected.rules[0]!.result!.outcome!.choice, call.callId === 'valid-fail' ? 'FAIL' : 'PASS');
      }
    }
    assert.ok(!JSON.stringify([status, findings, overview]).includes(sentinel));
    damageFreshDetail = true;
    const fresh = await index.threadFindings(thread);
    assert.deepEqual(fresh.items, [], 'fresh detail must recheck identity even after metadata accepted the call');
    assert.ok(fresh.issues.includes('detail-unavailable'));
    const valid = overview.calls.find(call => call.callId === 'valid-fail')!;
    const damaged = await index.threadOverview(thread, { sessionId: overview.sessionId!, callId: valid.id });
    assert.equal(damaged.selected?.evaluatorState?.status, 'incomplete');
    assert.ok(damaged.selected?.rules.every(rule => rule.result === null));
  } finally { await rm(root, { recursive: true, force: true }); }
});
