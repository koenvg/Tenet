import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Detail from '../inspector/src/Detail.js';
import { invocationView } from '../src/inspector/view.js';
import { validRecord, type ArchiveRecord, type Stage } from '../src/recording/contract.js';

function retainedRecords(schemaVersion: 1 | 3, stages: [Stage, Record<string, unknown>][]): ArchiveRecord[] {
  return stages.map(([stage, data], index) => {
    const record = {
      schemaVersion, writerId: '11111111-1111-4111-8111-111111111111', eventId: randomUUID(),
      sessionId: 'fictional-detail-boundary', invocationId: 'one', callId: 'one', toolName: 'read',
      cwd: '/fictional-detail-boundary', mode: 'observe', sequence: index + 1,
      timestamp: Date.UTC(2025, 0, 1), stage, data,
      ...(schemaVersion === 3 ? { host: 'pi', contextId: 'main' } : {}),
    };
    assert.ok(validRecord(record), `fictional ${stage} must pass the retained-record contract`);
    return record;
  });
}

const completedLifecycle: [Stage, Record<string, unknown>][] = [
  ['begin', {}], ['assessment-status', { status: 'completed' }],
  ['decision', { decision: 'ALLOW', reason: 'all-rules-pass' }], ['permission', { outcome: 'released' }],
];

test('selected detail never presents a completed lifecycle without retained assessment as a pass', () => {
  const view = invocationView(retainedRecords(3, completedLifecycle));
  assert.equal(view.assessmentStatus, 'completed');
  assert.equal(view.evaluatorState.status, 'incomplete');
  const html = renderToStaticMarkup(createElement(Detail, { view }));
  assert.match(html, /data-fact="assessment"[^>]*>Incomplete<\/dd>/);
  assert.match(html, /Assessment incomplete\. No completed assessment is available\./);
  assert.doesNotMatch(html, /Would allow in enforce mode|No blocking issues or approval requirements were recorded/);
  assert.match(html, /<dt>Assessment<\/dt><dd>completed<\/dd>/);
  assert.match(html, /<dt>Would decide<\/dt><dd>ALLOW<\/dd>/);
});

test('selected detail treats a completed lifecycle with inconsistent retained assessment as incomplete', () => {
  const stages: [Stage, Record<string, unknown>][] = [
    completedLifecycle[0]!, ['assessment', { assessment: { model: 'offline', rules: 'inconsistent historical shape' } }],
    ...completedLifecycle.slice(1),
  ];
  const view = invocationView(retainedRecords(3, stages));
  assert.equal(view.assessmentStatus, 'completed');
  assert.equal(view.evaluatorState.status, 'incomplete');
  const html = renderToStaticMarkup(createElement(Detail, { view }));
  assert.match(html, /data-fact="assessment"[^>]*>Incomplete<\/dd>/);
  assert.doesNotMatch(html, /Would allow in enforce mode|No blocking issues or approval requirements were recorded/);
});

function malformedView(field: 'outcome' | 'effect-threshold' | 'selected-evidence' | 'evidence-threshold' | 'outcome-choice') {
  const malformed = { recorded: `malformed-${field}` };
  const outcome = { choice: field === 'outcome-choice' ? { toString: 'malformed', ...malformed } : 'PASS', probabilities: { PASS: field === 'outcome' ? malformed : .99 } };
  const evidence = { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: .1, INSUFFICIENT: field === 'selected-evidence' ? malformed : .9 } };
  const config = { effectThreshold: field === 'effect-threshold' ? malformed : .9, evidenceThreshold: field === 'evidence-threshold' ? malformed : .9 };
  return invocationView(retainedRecords(1, [
    ['begin', { policy: { rules: [{ id: 'r', text: 'Fictional retained rule', enforcement: 'BLOCK' }] }, config }],
    ['assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'r', outcome, evidence }] }, config }],
    ['validation', { valid: false }], ['decision', { decision: 'BLOCK', reason: 'invalid-response' }],
    ['permission', { outcome: 'released' }],
  ]));
}

for (const field of ['outcome', 'effect-threshold', 'selected-evidence', 'evidence-threshold', 'outcome-choice'] as const) {
  test(`closed selected detail keeps malformed retained ${field} readings available as inert exact data`, () => {
    const view = malformedView(field);
    assert.equal(view.validation.valid, false);
    const html = renderToStaticMarkup(createElement(Detail, { view }));
    assert.match(html, /data-fact="assessment"[^>]*>Unavailable<\/dd>/);
    assert.match(html, /Unavailable \(malformed recording\)/);
    assert.match(html, new RegExp(`malformed-${field}`));
    assert.doesNotMatch(html, /<details[^>]*\sopen(?:[=\s>])/);
    assert.doesNotMatch(html, /<script[\s>]|<img[\s>]/);
  });
}
