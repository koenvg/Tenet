import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { recordInvocationKey, recordSessionKey } from '../../../src/recording/archive.js';
import { recordedQuestion } from '../browser-fixture.js';

// Authored fictional data only. No tool, current file or evaluator is used.
const identity = (id: string) => ({ schemaVersion: 4 as const, host: 'pi' as const, contextId: 'main', sessionId: 'fictional-recorded-data', invocationId: id, callId: id, toolName: 'edit', cwd: '/fictional-recorded-data', mode: 'observe' as const });
export const recordedDataLink = (id = 'submitted-edit') => `/?session=${recordSessionKey(identity(id))}&invocation=${recordInvocationKey(identity(id))}`;
export async function seedRecordedData(directory: string) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  const policy = { source: '/fictional/TENET.md', target: '/fictional/TENET.md', digest: 'fictional-recorded-data', rules: [
    { id: 'local', text: 'Keep fictional customer data local.', line: 1, enforcement: 'BLOCK' },
    { id: 'approval', text: 'Confirm publication with the owner.', line: 2, enforcement: 'BLOCK' },
  ] };
  const calls = [
    { id: 'submitted-edit', args: { path: 'src/billing/format.ts', oldText: 'export const format = (value) => value;\n', newText: 'export const format = (value) => `USD ${value}`;\n' } },
    { id: 'arbitrary', args: { custom: '<img src="https://hostile.invalid/probe">', nested: { marker: '[REDACTED]' }, oldText: null } },
    { id: 'missing', args: null },
  ];
  for (const call of calls) {
    const sink = writer.bindHistorical(identity(call.id), 4);
    sink('begin', { policy, config: { effectThreshold: .9, evidenceThreshold: .9 } });
    sink('request', { policy, questionVersion: 'fictional-questions-v1', mapping: policy.rules.map((rule, i) => ({ id: rule.id, outcomeKey: `${rule.id}_outcome`, evidenceKey: `${rule.id}_evidence`, reference: `state.policy.rules[${i}].text` })), payload: {
      model: 'offline', questions: Object.fromEntries(policy.rules.flatMap(rule => [[`${rule.id}_outcome`, recordedQuestion], [`${rule.id}_evidence`, { instructions: 'Is the **recorded evidence** sufficient?', criteria: { SUFFICIENT: 'Enough captured facts.', INSUFFICIENT: 'A material gap remains.' } }]])),
      state: { action: { arguments: call.args }, policy, context: { note: '[REDACTED]' }, trajectory: { events: [{ timestamp: 1, kind: 'tool-call', data: '[OMITTED: historical content]' }], values: ['fictional reference pool'] }, integrity: {} },
    } });
    sink('response', { truncated: true, bytes: 1049000, preview: '{"fictional":"response preview"}' });
    sink('validation', { valid: false, validationIssue: 'unit-sum' });
    sink('assessment-status', { status: 'unavailable', reason: 'invalid-response', validationIssue: 'unit-sum', profile: 'legacy' });
    sink('decision', { decision: 'BLOCK', reason: 'invalid-response', validationIssue: 'unit-sum' });
    sink('permission', { outcome: 'released' });
    await writer.settle();
  }
  await writer.complete();
}
