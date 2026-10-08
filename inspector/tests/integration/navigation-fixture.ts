import { FixtureArchiveWriter } from '../../../test/archive-fixture.js';
import { recordSessionKey } from '../../../src/recording/archive.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const navigationSession = recordSessionKey({ schemaVersion: 1, sessionId: 'fictional-navigation', invocationId: '' });
export const navigationPath = `/?session=${navigationSession}`;
/** Authored fictional archive. No action, provider or owner recording access. */
export async function seedNavigation(directory: string, warnings = false) {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  for (let n = 0; n < 4; n++) {
    const sink = writer.bindHistorical({ sessionId: 'fictional-navigation', invocationId: `call-${n}`, callId: `call-${n}`,
      toolName: n === 0 ? 'bash' : 'edit', cwd: '/fictional-example', mode: 'observe' }, 1);
    const policy = { source: n === 2 ? '/fictional-alternate/TENET.md' : '/fictional-example/TENET.md', digest: 'fictional-policy', target: '/fictional-example/TENET.md', rules: [{ id: 'release', text: 'Keep fictional customer data inside the project.', enforcement: 'BLOCK', line: 1 }] };
    sink('begin', { policy, config: { effectThreshold: .9, evidenceThreshold: .9 } });
    sink('request', { policy, questionVersion: 'fictional-navigation-v1', mapping: [], payload: { model: 'offline', questions: {}, state: { action: { arguments: n === 3 ? {} : n === 0 ? { command: 'bun test test/format.test.ts' } : { path: `src/billing/${n === 1 ? 'format' : 'totals'}.ts` } }, policy, context: {}, trajectory: {}, integrity: {} } } });
    sink('assessment', { assessment: { model: 'offline', rules: [{ ruleId: 'release', outcome: { choice: 'PASS', probabilities: { PASS: .88, FAIL: .07, APPROVAL_REQUIRED: .05 } }, evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .85, INSUFFICIENT: .15 } } }] } });
    sink('decision', { decision: 'BLOCK', reason: 'insufficient-evidence', diagnostics: [{ ruleId: 'release', gates: ['outcome-confidence-below-threshold'], effectThreshold: .9, evidenceThreshold: .9 }] });
    sink('permission', { outcome: 'released' });
    await writer.settle();
  }
  await writer.complete();
  if (warnings) await writeFile(join(directory, navigationSession, 'fictional-unsupported.json'), JSON.stringify({ schemaVersion: 999 }), { mode: 0o600 });
}
