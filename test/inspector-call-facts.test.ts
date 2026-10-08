import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invocationView } from '../src/inspector/view.js';
import { permissionFact, resultFact, assessmentFact, displayedContext, summaryFindings } from '../inspector/src/standalone-presentation.js';

for (const permission of ['released', 'blocked', 'unknown', undefined, 'future']) test(`named permission ${permission} does not infer execution`, () => {
  assert.equal(permissionFact(permission).label, permission === 'released' ? 'Not blocked by Tenet' : permission === 'blocked' ? 'Blocked by Tenet' : 'Unknown');
});
for (const execution of ['executed', 'failed', 'unknown', undefined, 'future']) test(`named result ${execution} does not infer permission`, () => {
  assert.equal(resultFact(execution).label, execution === 'executed' ? 'Successful' : execution === 'failed' ? 'Failed' : 'Unknown / not recorded');
});
for (const status of ['pending', 'dropped', 'cancelled', 'unavailable', 'incomplete', 'failed', 'future']) test(`assessment ${status} is never a pass even with ALLOW`, () => {
  const view = invocationView([]); view.assessmentStatus = status; view.decision = 'ALLOW';
  assert.doesNotMatch(assessmentFact(view), /Allow|PASS|no findings/i);
});
test('invalid completed assessment stays unavailable and all independent findings survive', () => {
  const view = invocationView([]); view.assessmentStatus = 'completed'; view.decision = 'ALLOW'; view.validationIssue = 'unit-sum';
  view.categories = ['violation', 'uncertainty', 'approval', 'unavailable'];
  assert.equal(assessmentFact(view), 'Unavailable');
  assert.deepEqual(summaryFindings(view), ['violation', 'uncertainty', 'approval']);
});
const ordinary = { mode: 'observe', permission: 'released', execution: 'unknown', assessmentStatus: 'validated', missing: ['execution'], categories: [] };
test('shared context requires exact recorded facts for every displayed call', () => {
  assert.deepEqual(displayedContext([ordinary, ordinary]), { mode: 'observe', permission: 'released', absentResult: true });
  assert.deepEqual(displayedContext([]), { mode: null, permission: null, absentResult: false });
  for (const exception of [{ mode: 'enforce' }, { mode: undefined }, { permission: 'unknown' }, { permission: 'blocked' }, { execution: 'failed' }, { assessmentStatus: 'pending' }, { assessmentStatus: 'dropped' }, { assessmentStatus: 'cancelled' }, { failure: 'invalid-response' }, { missing: ['assessment', 'execution'] }]) {
    const context = displayedContext([ordinary, { ...ordinary, ...exception }]);
    assert.equal(context.mode, null, JSON.stringify(exception));
  }
  assert.equal(displayedContext([ordinary, { ...ordinary, execution: 'executed', missing: [] }]).absentResult, false);
  assert.equal(displayedContext([{ ...ordinary, execution: 'future' }]).absentResult, false);
  assert.equal(displayedContext([{ ...ordinary, missing: [] }]).absentResult, false, 'unknown does not establish an absent stage');
});

for (const stage of ['assessment', 'validation', 'decision', 'assessment-status']) test(`invalid ${stage} cannot become a completed Allow`, () => {
  const view = invocationView([
    { stage: 'assessment-status', data: { status: 'completed' }, timestamp: 1 },
    { stage: 'decision', data: { decision: 'ALLOW' }, timestamp: 2 },
    { stage, data: { valid: false, status: 'completed', decision: 'ALLOW' }, timestamp: 3 },
  ] as any);
  assert.equal(assessmentFact(view), 'Unavailable');
});
