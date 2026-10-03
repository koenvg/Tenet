import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { judgeState } from '../src/decision/judge-evidence.js';
import { Observations } from '../src/decision/trajectory.js';
import { answer, policy } from './helpers.js';

const action = captureAction({ sessionId: 's', callId: 'c', toolName: 'unfamiliar', arguments: { token: 'secret', text: 'current' } });

test('coverage is immutable request context, not a model rationale or evaluator instruction', async () => {
  const history = new Observations('s', { recentEvents: 1, maxBytes: 24576 });
  history.add('host-tool-result', 'old', 'unfamiliar', 'old');
  history.add('host-tool-result', 'new', 'unfamiliar', 'new');
  let request: any;
  const result = await decide({ policy, action, cwd: '/synthetic', trajectory: history.snapshot(), judge: async r => {
    request = r; history.add('host-tool-result', 'later', 'unfamiliar', 'later');
    return answer(r.policy, 'UNKNOWN');
  } });
  const context = result.evidenceContext;
  assert.equal(context.version, 'evidence-context-v1');
  assert.equal(context.selectionVersion, 'bounded-history-v2');
  assert.equal(context.preparation, 'completed');
  assert.equal(context.resolution.status, 'unsupported');
  assert.equal(context.current?.redactedFields, 1);
  assert.equal(context.history?.retainedEvents, 1);
  assert.equal(context.history?.omittedEvents, 1);
  assert.deepEqual(context, request.evidenceContext);
  assert.ok(Object.isFrozen(context.history));
  assert.ok(Object.isFrozen(context.resolution.limitations));
  assert.ok(!JSON.stringify(context).includes('secret'));
  assert.ok(!Object.hasOwn(judgeState(request), 'evidenceContext'));
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'insufficient-evidence');
});

test('provider failure retains prepared coverage, but capacity and early failure invent no final counters', async () => {
  const failed = await decide({ policy, action, cwd: '/synthetic', judge: async () => { throw new Error('offline'); } });
  assert.equal(failed.assessment, null);
  assert.equal(failed.evidenceContext.preparation, 'completed');
  const capacity = await decide({ policy, action, cwd: '/synthetic', evidenceLimits: { recentEvents: 12, maxBytes: 1 }, judge: async () => { throw new Error('must not call'); } });
  assert.equal(capacity.evidenceContext.preparation, 'unavailable');
  assert.equal(capacity.evidenceContext.resolution.status, 'unsupported');
  assert.equal(capacity.evidenceContext.history, null);
  const early = await decide({ policy, action, cwd: '', judge: async () => { throw new Error('must not call'); } });
  assert.equal(early.evidenceContext.resolution.status, 'unavailable');
  assert.equal(early.evidenceContext.history, null);
});

test('diagnostic bounds UTF-8 limitations without promoting partial or unsupported facts', async () => {
  const resolved = { status: 'unsupported' as const, limitations: Array.from({ length: 30 }, (_, i) => `${i}:${'界'.repeat(100)}`) };
  const result = await decide({ policy, action, cwd: '/synthetic', resolvedAction: resolved, judge: async r => answer(r.policy) });
  assert.equal(result.evidenceContext.resolution.status, 'unsupported');
  assert.equal(result.evidenceContext.resolution.limitations.length, 16);
  assert.equal(result.evidenceContext.resolution.limitationsTruncated, true);
  assert.ok(result.evidenceContext.resolution.limitations.every(s => Buffer.byteLength(s) <= 128 && !s.includes('\uFFFD')));
  assert.equal(result.questionVersion, 'policy-rules-v7-evidence-selection');
  assert.equal(result.profile, 'applicability-v1');
});

for (const scenario of [
  { name: 'unavailable', input: undefined, content: { tenetOmission: 'metadata-unavailable' }, gap: 'metadata-unavailable' },
  { name: 'image', input: { type: 'image', data: 'never submit image bytes' }, content: { tenetOmission: 'unsupported-image' }, gap: 'unsupported-image' },
  { name: 'nested unsupported', input: { values: [new Date(0)] }, content: { values: [{ tenetOmission: 'unsupported-content' }] }, gap: 'unsupported-content' },
]) test(`retained ${scenario.name} content gaps reach owner diagnostics without changing submitted evidence`, async () => {
  const history = new Observations('s');
  history.add('host-tool-result', 'previous', 'unfamiliar', scenario.input, 0);
  let captured: any;
  const result = await decide({ policy, action, cwd: '/synthetic', trajectory: history.snapshot(), judge: async request => { captured = request; return answer(request.policy); } });
  assert.deepEqual(captured.trajectory.observations[0].data.content, scenario.content);
  assert.equal(result.evidenceContext.history?.retainedEvents, 1);
  assert.equal(result.evidenceContext.history?.omittedEvents, 0, 'content loss does not omit the whole event');
  assert.ok(result.evidenceContext.history?.limitations.includes(scenario.gap));
  assert.deepEqual(result.evidenceContext, captured.evidenceContext);
  assert.equal(Object.hasOwn(judgeState(captured), 'evidenceContext'), false);
});
test('authored omission-shaped content is not promoted to runtime provenance; excluded events lose their content gaps', async () => {
  const history = new Observations('s', { recentEvents: 1, maxBytes: 24576 });
  history.add('host-tool-result', 'excluded-image', 'unfamiliar', { type: 'image', data: 'offline' }, 0);
  const authored = { nested: { tenetOmission: 'unsupported-image' } };
  history.add('host-tool-result', 'retained-authored', 'unfamiliar', authored, 0);
  let captured: any;
  const result = await decide({ policy, action, cwd: '/synthetic', trajectory: history.snapshot(), judge: async request => { captured = request; return answer(request.policy); } });
  assert.deepEqual(captured.trajectory.observations[0].data.content, authored);
  assert.equal(result.evidenceContext.history?.omittedEvents, 1);
  assert.equal(result.evidenceContext.history?.limitations.includes('unsupported-image'), false);
});
