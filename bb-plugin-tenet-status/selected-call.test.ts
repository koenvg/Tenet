import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overviewSchema } from './overview-contract.js';
import { emptyOverview, projectSummaryDecision } from '../src/inspector/bb-summary.js';
import { selectedPassRecords, selectedRecords } from '../test/selected-summary-fixture.js';

const id = 'a'.repeat(64);
test('strict owner selected RPC permits exactly the bounded recorded field and compact FAIL facts', () => {
  const selected = projectSummaryDecision(selectedRecords(20));
  const response = { ...emptyOverview(), state: 'available', selectedId: id, selected };
  assert.deepEqual(overviewSchema.parse(response).selected?.recordedAction, { field: 'command', text: 'printf "a  b"\n  echo 雪', truncated: false });
  for (const invalid of [
    { ...selected.recordedAction, text: '雪'.repeat(1366) },
    { ...selected.recordedAction, field: 'cwd' },
    { ...selected.recordedAction, arguments: { private: true } },
    { ...selected.recordedAction, truncated: 'yes' },
  ]) assert.throws(() => overviewSchema.parse({ ...response, selected: { ...selected, recordedAction: invalid } }));
  assert.throws(() => overviewSchema.parse({ ...response, selected: { ...selected, reportedViolations: { ...selected.reportedViolations, items: Array(17).fill(selected.reportedViolations!.items[0]) } } }));
  assert.throws(() => overviewSchema.parse({ ...response, selected: { ...selected, reportedViolations: { ...selected.reportedViolations, raw: 'private' } } }));
  assert.throws(() => overviewSchema.parse({ ...response, calls: [{ id, callId: 'call', toolName: 'bash', timestamp: 0, mode: 'observe', decision: 'BLOCK', permission: 'released', execution: 'unknown', categories: [], missing: [], assessmentStatus: 'completed', failure: null, evaluatorState: { status: 'completed', reason: null }, recordedAction: selected.recordedAction }] }));
});

test('selected RPC requires coherent whole-call uncertainty, including unavailable assessments', () => {
  const selected = projectSummaryDecision(selectedRecords());
  const parse = (reportedViolations: unknown) => overviewSchema.parse({ ...emptyOverview(), state: 'available', selectedId: id, selected: { ...selected, reportedViolations } });
  assert.equal(parse({ ...selected.reportedViolations, uncertain: false }).selected?.reportedViolations.uncertain, false);
  const { uncertain, ...missing } = selected.reportedViolations as any;
  assert.throws(() => parse(missing));
  assert.throws(() => parse({ ...selected.reportedViolations, uncertain: 'false' }));
  assert.throws(() => parse({ assessment: 'unavailable', uncertain: false, items: [], total: 0, missingRuleSnapshots: 0 }));
  assert.equal(parse({ assessment: 'unavailable', uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 }).selected?.reportedViolations.uncertain, true);
});

for (const gate of ['outcome-confidence-below-threshold', null]) test(`selected RPC retains uncertainty after the finding cap for ${gate ?? 'missing gates'}`, () => {
  const rows = selectedPassRecords(gate);
  for (const offset of [0, 16]) {
    const selected = projectSummaryDecision(rows, offset);
    const parsed = overviewSchema.parse({ ...emptyOverview(), state: 'available', selectedId: id, selected }).selected!;
    assert.deepEqual(parsed.reportedViolations, { assessment: 'validated', uncertain: true, items: [], total: 0, missingRuleSnapshots: 0 });
    assert.equal(parsed.noRulesClassifiedViolated, true);
    assert.deepEqual(parsed.categories, []);
  }
});
