import { FixtureArchiveWriter } from './archive-fixture.js';

export const evaluatorThreadId = 'thr_abcdefgh1234';
export const evaluatorSentinel = 'synthetic-private-provider-body';

/** Two historical linked calls. Tools ran, but neither evaluator returned a valid assessment. */
export async function writeProviderErrorFixture(root: string): Promise<void> {
  const writer = new FixtureArchiveWriter({ enabled: true, directory: root });
  for (const id of ['read-call', 'printf-call']) {
    const sink = writer.bindHistorical({ sessionId: 'provider-fixture', invocationId: id, callId: id,
      toolName: id === 'read-call' ? 'read' : 'bash', cwd: '/synthetic', mode: 'observe', host: 'pi', contextId: 'main',
      bbThreadId: evaluatorThreadId }, 3);
    const policy = { rules: [{ id: 'r', text: 'Synthetic rule', enforcement: 'WARN' }] };
    sink('begin', { policy, action: evaluatorSentinel });
    sink('request', { policy, payload: { model: 'fixture', state: { action: { text: evaluatorSentinel }, policy: {},
      context: {}, trajectory: {}, integrity: {} }, questions: { q: evaluatorSentinel } }, questionVersion: 'v1', mapping: [] });
    sink('response', { unavailable: true, body: evaluatorSentinel });
    sink('validation', { valid: false, message: evaluatorSentinel });
    sink('assessment', {});
    sink('decision', { decision: 'BLOCK' });
    sink('permission', { outcome: 'released' });
    sink('execution', { outcome: 'executed' });
    sink('assessment-status', { status: 'unavailable', reason: 'provider-error', profile: 'legacy', message: evaluatorSentinel });
  }
  await writer.complete();
}
