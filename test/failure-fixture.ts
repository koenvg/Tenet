import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readArchive, sessionKey } from '../src/recording/archive.js';
import { ArchiveWriter } from './legacy-recording-fixture.js';
import { responseSnapshot } from '../src/recording/contract.js';
import { createJevJudge } from '../src/decision/jev.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { policy } from './helpers.js';

// Offline failure history, including deliberately interrupted and damaged recordings.
export async function recordFailureFixture(directory: string) {
  const identity = { sessionId: 'failure-history', invocationId: '', callId: '', toolName: 'edit', cwd: '/synthetic/project', mode: 'observe' as const };
  const writer = new ArchiveWriter({ enabled: true, directory });
  for (const kind of ['missing-credentials', 'provider-error', 'invalid-response', 'truncated-response', 'interrupted', 'unavailable-response', 'missing-payload']) {
    const sink = writer.bind({ ...identity, invocationId: kind, callId: kind });
    sink('begin', { policy });
    const result = await decide({ policy, cwd: identity.cwd,
      action: captureAction({ sessionId: identity.sessionId, callId: kind, toolName: 'edit', arguments: {} }),
      judge: createJevJudge({ apiKey: kind === 'missing-credentials' ? '' : 'fixture-transport-secret', fetch: async () => kind === 'provider-error'
        ? new Response('private-provider-body', { status: 503 })
        : Response.json({ model: 'invalid', answers: {}, text: '<script>window.hostile = true</script>' + (kind === 'truncated-response' ? 'x'.repeat(1024 * 1024) : '') }) }),
      recording: (stage, data) => {
        if (kind === 'interrupted' && stage !== 'request') return;
        if (kind === 'missing-payload' && stage === 'request') return;
        sink(stage, kind === 'unavailable-response' && stage === 'response' ? responseSnapshot(undefined) : data);
      } });
    if (kind !== 'interrupted') {
      sink('decision', { decision: result.decision, reason: result.reason });
      sink('permission', { outcome: 'released', requestStatus: kind === 'missing-credentials' ? 'not-submitted' : 'submitted' });
    }
  }
  await writer.drain();
  const request = (await readArchive(directory)).records.find(r => r.stage === 'request')!;
  await writer.close();
  const overflow = new ArchiveWriter({ enabled: true, directory }, { events: 1, bytes: 10000 });
  const sink = overflow.bind({ ...identity, invocationId: 'capture-loss', callId: 'capture-loss' });
  sink('begin', {}); sink('decision', { decision: 'ALLOW' });
  await overflow.close();
  const folder = join(directory, sessionKey(identity.sessionId));
  await writeFile(join(folder, 'interrupted.tmp'), '{', { mode: 0o600 });
  await writeFile(join(folder, 'corrupt.json'), '{', { mode: 0o600 });
  await writeFile(join(folder, 'unsupported.json'), JSON.stringify({ ...request, schemaVersion: 999 }), { mode: 0o600 });
}
