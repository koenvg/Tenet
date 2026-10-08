import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';

// Authored fictional strings only. No actions run and no evaluator is called.
export const previewSession = 'fictional-preview';
export const hostileCommand = '<script>fictional()</script> https://invalid.example/private ' + '雪😀'.repeat(200);
export async function seedPreview(directory: string) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  const calls = [
    { id: 'format', tool: 'edit', args: { path: 'src/billing/format.ts', oldText: 'fictional old value', newText: 'fictional new value' } },
    { id: 'totals', tool: 'edit', args: { file_path: 'src/billing/totals.ts' } },
    { id: 'test', tool: 'bash', args: { command: 'bun test\n  test/format.test.ts' } },
    { id: 'hostile', tool: 'bash', args: { command: hostileCommand } },
    { id: 'unavailable', tool: 'read', args: { path: 42 } },
  ];
  for (const call of calls) {
    const sink = writer.bindHistorical({ sessionId: previewSession, invocationId: call.id, callId: call.id,
      toolName: call.tool, cwd: '/fictional-example', mode: 'observe' }, 1);
    sink('begin', {});
    sink('request', { policy: { rules: [] }, questionVersion: 'fictional-preview-v1', mapping: [],
      payload: { model: 'offline', questions: {}, state: { action: { arguments: call.args }, policy: {}, context: {}, trajectory: {}, integrity: {} } } });
    sink('permission', { outcome: 'released' });
    await writer.settle();
  }
  await writer.complete();
}
