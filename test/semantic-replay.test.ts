import assert from 'node:assert/strict';
import { test } from 'node:test';
import { semanticCases } from '../eval/semantic-fixtures.js';
import { replaySemantic, summarize, scriptedJudge } from '../eval/semantic-replay.js';
import { parseReplayArgs } from '../eval/semantic-cli.js';

const clock = { now: () => 0, schedule: () => () => {} };
test('paired replay is deterministic, generic and never validates offline semantics', async () => {
  const run = () => replaySemantic({ cases: semanticCases, judge: scriptedJudge, clock });
  const a = await run();
  assert.deepEqual(a, await run());
  assert.equal(a.rows.length, semanticCases.length * 2);
  assert.equal(a.validatedPOC, false);
  assert.equal(a.canonicalPassed, true);
  assert.ok(a.byMode.trajectory.semanticSuccess.count > 0);
  assert.ok(a.rows.every(r => r.result?.questionVersion === a.versions.questions));
  assert.ok(a.paired.find(r => r.id === 'context-upload')?.decisionChanged);
  assert.ok(a.rows.every(r => !JSON.stringify(r.request).includes('expectedEffect')));
  const renamed = semanticCases.map(c => ({ ...c, family: 'irrelevant-reporting-tag' }));
  const b = await replaySemantic({ cases: renamed, judge: scriptedJudge, clock });
  assert.deepEqual(a.rows.map(r => r.request), b.rows.map(r => r.request));
  assert.deepEqual(a.rows.map(r => r.result), b.rows.map(r => r.result));
});

test('fixed dataset exposes blanket blocking, skipped cases, missing evidence and host failures', async () => {
  const report = await replaySemantic({ cases: semanticCases, judge: scriptedJudge, clock });
  const safe = report.rows.find(r => r.expectedDecision === 'ALLOW')!;
  const publish = report.rows.find(r => r.expectedDecision === 'ASK')!;
  const rows = [
    { ...safe, result: { ...safe.result!, decision: 'BLOCK' as const }, machineMs: 10 },
    { ...publish, result: { ...publish.result!, decision: 'ALLOW' as const }, machineMs: 20 },
    { ...safe, status: 'skipped' as const, result: null, machineMs: null },
    { ...safe, omitted: 1, machineMs: 30 },
    { ...safe, status: 'host-failure' as const, result: null, machineMs: 40 },
  ];
  const s = summarize(rows);
  assert.deepEqual(s.semanticSuccess, { count: 0, denominator: 5 });
  assert.deepEqual(s.falseAllows, { count: 1, denominator: 1 });
  assert.deepEqual(s.unnecessaryBlocks, { count: 1, denominator: 4 });
  assert.equal(s.skipped.count, 1);
  assert.equal(s.hostFailures.count, 1);
  assert.equal(s.omittedObservations, 1);
  assert.deepEqual(s.machineLatency, { count: 4, p50: 20, p95: 40 });
  const blanket = summarize(report.rows.map(r => ({ ...r, result: r.result && { ...r.result, decision: 'BLOCK' as const } })));
  assert.equal(blanket.unnecessaryBlocks.count, blanket.unnecessaryBlocks.denominator);
  const wrong = summarize([{ ...publish, result: safe.result }, { ...safe, result: publish.result }]);
  assert.deepEqual(wrong.wrongEffects, { count: 2, denominator: 2 });
  assert.equal(wrong.unnecessaryPrompts.count, 1);
  assert.equal(summarize([]).machineLatency.p95, null);
  assert.equal(report.byTool['trajectory:quux_73']!.semanticSuccess.count, 1);
});

test('failures, omissions and unavailable cases never pass canonical gate', async () => {
  const cases = semanticCases.map((c, i) => i === 0 ? { ...c, unavailable: 'fixture intentionally unavailable' } : c);
  const report = await replaySemantic({ cases, judge: async () => { throw Error('offline failure'); }, clock });
  assert.equal(report.canonicalPassed, false);
  assert.equal(report.summary.semanticSuccess.count, 0);
  assert.equal(report.summary.unavailable.count, 2);
  assert.equal(report.summary.providerFailures.count, report.rows.length - 2);
  const skipped = await replaySemantic({ cases: semanticCases, judge: scriptedJudge, clock, skip: { 'shell-publish': 'test skip' } });
  assert.equal(skipped.canonicalPassed, false);
  assert.equal(skipped.summary.skipped.count, 2);
  const omitted = semanticCases.map(c => ({ ...c, trajectory: { ...c.trajectory, omitted: 3 } }));
  const gaps = await replaySemantic({ cases: omitted, judge: scriptedJudge, clock });
  assert.equal(gaps.canonicalPassed, false);
  assert.equal(gaps.summary.semanticSuccess.count, 0);
  const broken = [{ ...semanticCases[0]!, action: { toolName: 'broken', arguments: () => {} } }];
  const host = await replaySemantic({ cases: broken, judge: scriptedJudge, clock });
  assert.equal(host.summary.hostFailures.count, 2);
  assert.equal(host.summary.semanticSuccess.count, 0);
});
test('live-labeled canonical failure cannot validate a POC', async () => {
  const report = await replaySemantic({ cases: semanticCases, clock, live: true, judge: async (request, signal) => {
    const response = await scriptedJudge(request, signal) as { model: string; rules: Array<{ outcome: { choice: string; probabilities: Record<string, number> } }> };
    response.model = 'test-only-live-stand-in';
    if (request.action.callId === 'unfamiliar-publish') response.rules[0]!.outcome = { choice: 'PASS', probabilities: { PASS: 1, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0 } };
    return response;
  } });
  assert.equal(report.canonicalPassed, false);
  assert.equal(report.validatedPOC, false);
  assert.equal(report.byTool['trajectory:quux_73']!.falseAllows.count, 1);
});


test('live CLI requires explicit disclosure authorization and credentials before replay', () => {
  assert.throws(() => parseReplayArgs(['--live', '--output', 'r.json'], { TYPESAFE_API_KEY: 'dummy' }));
  assert.throws(() => parseReplayArgs(['--live', '--authorize-evidence-disclosure', '--output', 'r.json'], {}));
  assert.throws(() => parseReplayArgs(['--output', '--live'], {}));
  assert.throws(() => parseReplayArgs(['--output', 'r.json', '--typo'], {}));
  assert.deepEqual(parseReplayArgs(['--output', 'r.json'], {}), { live: false, output: 'r.json' });
  assert.equal(parseReplayArgs(['--live', '--authorize-evidence-disclosure', '--output', 'r.json'], { TYPESAFE_API_KEY: 'dummy' }).live, true);
});
