import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectThreadFinding } from '../src/inspector/bb-findings.js';
import type { ArchiveRecord, Stage } from '../src/recording/contract.js';

const threadId = 'thr_abcdefgh1234';
const record = (stage: Stage, data: Record<string, unknown>): ArchiveRecord => ({
  schemaVersion: 3, host: 'pi', contextId: 'main', bbThreadId: threadId,
  sessionId: 'session', invocationId: 'invocation', callId: 'edit-1', toolName: 'edit', cwd: '/tmp', mode: 'observe',
  writerId: 'a'.repeat(36), eventId: 'b'.repeat(36), sequence: 1, timestamp: 1, stage, data,
});
const base = [
  record('begin', { policy: { rules: [{ id: 'r1', text: 'Do not edit secrets', enforcement: 'WARN' }] }, config: { effectThreshold: 0.85 } }),
  record('validation', { valid: true }),
  record('assessment', { assessment: { model: 'fixture', rules: [{ ruleId: 'r1', outcome: { choice: 'FAIL', probabilities: { FAIL: 0.99 } },
    evidence: { choice: 'INSUFFICIENT', probabilities: { SUFFICIENT: 0.1, INSUFFICIENT: 0.9 } } }] } }),
];
test('missing decision or per-rule diagnostics cannot hide uncertainty on a high-confidence FAIL', () => {
  for (const extra of [[], [record('decision', { decision: 'BLOCK' })],
    [record('decision', { decision: 'BLOCK', contributions: [{ ruleId: 'other', gates: ['rule-fail'] }] })]]) {
    const item = projectThreadFinding([...base, ...extra], 'a'.repeat(64), threadId).item!;
    assert.equal(item.rules[0]!.confidence, 0.99);
    assert.equal(item.rules[0]!.uncertain, true);
  }
});
test('recorded per-rule evidence gates use the canonical uncertainty classification', () => {
  const item = projectThreadFinding([...base, record('decision', { decision: 'ALLOW', contributions: [
    { ruleId: 'r1', outcome: 'FAIL', gates: ['rule-fail', 'evidence-insufficient'] },
  ] })], 'a'.repeat(64), threadId).item!;
  assert.equal(item.rules[0]!.uncertain, true);
});
