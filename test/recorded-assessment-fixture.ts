import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPolicy } from '../src/decision/policy.js';
import { policyIntegrity } from '../src/decision/policy-contract.js';
import { FixtureArchiveWriter } from './archive-fixture.js';

export const recordedAssessmentThread = 'thr_assessment77';
export const recordedFailureThread = 'thr_failure77';
export const recordedAssessmentSentinel = 'synthetic-private-assessment-body';
export const inconsistentAssessmentCalls = ['fail-pass', 'pass-fail', 'pass-pass', 'bad-id', 'missing-outcome', 'late-duplicate'];

/** Original schemas, synthetic files only. Legacy scores intentionally omit current evidence/distribution fields. */
export async function writeRecordedAssessmentFixture(root: string, schema: 3 | 4 | 5): Promise<void> {
  const source = join(root, 'fixture-policy.md');
  await writeFile(source, 'Rule; WARN; Synthetic recorded rule.');
  const current = await loadPolicy(source);
  if (!current.available) throw new Error('fixture-policy-unavailable');
  const policy = schema === 5 ? current : { rules: [{ id: 'r', text: 'Synthetic recorded rule.', enforcement: 'WARN' }] };
  const integrity = schema === 5 ? policyIntegrity(current) : { id: 'integrity', text: 'Synthetic integrity.' };
  const ruleId = policy.rules[0]!.id;
  const result = (ruleId: unknown, choice: string) => ({ ruleId, outcome: { choice, probabilities: { FAIL: .8 } } });
  const cases: Record<string, unknown[]> = {
    'valid-fail': [result(ruleId, 'FAIL')], 'valid-pass': [result(ruleId, 'PASS')],
    'fail-pass': [result(ruleId, 'FAIL'), result(ruleId, 'PASS')],
    'pass-fail': [result(ruleId, 'PASS'), result(ruleId, 'FAIL')],
    'pass-pass': [result(ruleId, 'FAIL'), result(integrity.id, 'PASS'), result(integrity.id, 'PASS')],
    'bad-id': [result(ruleId, 'FAIL'), result(42, 'PASS')],
    'missing-outcome': [result(ruleId, 'FAIL'), { ruleId: 'damaged' }],
    'late-duplicate': [result(ruleId, 'FAIL'), ...Array.from({ length: 65 }, (_, n) => result(`extra-${n}`, 'PASS')), result(ruleId, 'PASS')],
  };
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  for (const [callId, results] of Object.entries(cases)) {
    const identity = { sessionId: 'recorded-shape', invocationId: callId, callId, toolName: 'read', cwd: '/synthetic',
      mode: 'observe' as const, host: 'pi', contextId: 'main', bbThreadId: recordedAssessmentThread };
    const sink = schema === 5 ? writer.bind(identity) : writer.bindHistorical(identity, schema);
    sink('begin', { policy, integrity, action: recordedAssessmentSentinel });
    sink('response', { unavailable: true, body: recordedAssessmentSentinel });
    sink('validation', { valid: true });
    sink('assessment', { assessment: { model: 'offline', rules: [...results,
      ...(callId === 'pass-pass' ? [] : [result(integrity.id, 'PASS')])] }, response: recordedAssessmentSentinel });
    sink('assessment-status', { status: 'completed' });
    sink('decision', { decision: 'ALLOW' });
    sink('permission', { outcome: 'released' });
    sink('execution', { outcome: 'executed' });
    await writer.settle();
  }
  for (const shape of ['omitted', 'null'] as const) {
    const identity = { sessionId: 'recorded-failure', invocationId: shape, callId: shape, toolName: 'read', cwd: '/synthetic',
      mode: 'observe' as const, host: 'pi', contextId: 'main', bbThreadId: recordedFailureThread };
    const sink = schema === 5 ? writer.bind(identity) : writer.bindHistorical(identity, schema);
    sink('begin', { policy, integrity });
    sink('response', { unavailable: true, body: recordedAssessmentSentinel });
    sink('validation', { valid: false });
    // The guard records null when decide returns no assessment after an evaluator failure.
    sink('assessment', { ...(shape === 'null' ? { assessment: null } : {}), reason: 'provider-error' });
    sink('assessment-status', { status: 'unavailable', reason: 'provider-error' });
    sink('decision', { decision: 'BLOCK', reason: 'provider-error' });
    sink('permission', { outcome: 'released' });
    sink('execution', { outcome: 'executed' });
    await writer.settle();
  }
  await writer.complete();
  await rm(source);
}
