import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPolicy } from '../src/decision/policy.js';
import { validPolicySnapshot } from '../src/decision/policy-contract.js';
import { recordedOrigin, recordedPolicyIdentity } from '../src/recording/policy-contract.js';
import { validRecord } from '../src/recording/contract.js';
import { ArchiveWriter, readArchive } from '../src/recording/archive.js';
import { createJevJudge } from '../src/decision/jev.js';
import { decide } from '../src/decision/decide.js';
import { ruleContributions } from '../src/recording/rules.js';
import { captureAction } from '../src/decision/evidence.js';
import { invocationView } from '../src/inspector/view.js';
import { answer, sdkAnswers } from './helpers.js';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp('/tmp/tenet46-record-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const candidates = (root: string) => ['global', 'project'].map(role => ({ role: role as 'global' | 'project',
  source: join(root, role + '.md'), selection: 'local' as const, presence: 'present' as const }));

test('current policy validator rejects changed combined identity and mismatched declaration provenance', () => fixture(async root => {
  for (const c of candidates(root)) await writeFile(c.source, '# heading\nRule; Same.');
  const policy = await loadPolicy(candidates(root)); assert.ok(policy.available);
  assert.equal(validPolicySnapshot(policy), true);
  assert.equal(validPolicySnapshot({ ...policy, combinedDigest: '0'.repeat(64) }), false);
  const bad: any = structuredClone(policy); bad.rules[0]!.origin.role = 'project';
  assert.equal(validPolicySnapshot(bad), false);
  assert.equal(validPolicySnapshot({ ...policy, source: '/legacy-path' }), false);
  assert.equal(validPolicySnapshot({ available: false, contractVersion: 'policy-sources-v1', candidates: policy.candidates,
    reason: 'policy-format', failedRole: 'project', sources: policy.sources }), false);
}));

test('source-set archive roundtrip retains independent origins and gates after source deletion', () => fixture(async root => {
  for (const c of candidates(root)) await writeFile(c.source, '# heading\nRule; BLOCK; evidenceThreshold=0.92; Same.');
  const policy = await loadPolicy(candidates(root)); assert.ok(policy.available);
  const writer = new ArchiveWriter({ enabled: true, directory: join(root, 'archive') });
  const record = writer.bind({ host: 'sdk', contextId: 'current', sessionId: 's', callId: 'c', invocationId: 'i', toolName: 'edit', cwd: root, mode: 'enforce' });
  record('begin', { policy, config: { effectThreshold: .9, evidenceThreshold: .9 } });
  let submitted: any;
  const judge = createJevJudge({ apiKey: 'offline', fetch: async (_url, init) => {
    submitted = JSON.parse(init!.body as string);
    return Response.json({ model: 'offline-script', answers: sdkAnswers(answer(policy, 'PASS')) });
  } });
  const result = await decide({ policy, cwd: root, action: captureAction({ sessionId: 's', callId: 'c', toolName: 'edit', arguments: {} }), judge, recording: record });
  assert.equal(result.decision, 'ALLOW');
  record('assessment', { ...result });
  record('decision', { ...result, contributions: ruleContributions(result, policy) });
  await writer.close();
  const archive = await readArchive(join(root, 'archive')); assert.deepEqual(archive.issues, []);
  assert.ok(archive.records.every(r => r.schemaVersion === 5 && validRecord(r)));
  const request = archive.records.find(r => r.stage === 'request')!;
  assert.deepEqual(request.data.payload, submitted);
  assert.deepEqual(submitted.state.policy.rules.map((r: any) => r.origin.role), ['global', 'project']);
  assert.ok(!JSON.stringify(submitted).includes('evidenceThreshold'));
  const bad = structuredClone(request) as any; bad.data.payload.state.integrity.sources = [];
  assert.equal(validRecord(bad), false);
  const identity = recordedPolicyIdentity(5, policy);
  const before = invocationView(archive.records);
  for (const c of candidates(root)) await rm(c.source);
  const after = invocationView((await readArchive(join(root, 'archive'))).records);
  assert.deepEqual(after, before);
  assert.equal(recordedPolicyIdentity(5, policy), identity);
  for (const rule of policy.rules) assert.deepEqual(recordedOrigin(5, rule, policy), rule.origin);
}));

test('historical decoding retains recorded identity, thresholds and unknown source role', () => {
  const legacy = { available: true, source: '/recorded/TENET.md', target: '/recorded/target.md', digest: 'recorded-digest',
    rules: [{ id: 'recorded-digest:7', line: 7, text: 'Old rule.', enforcement: 'WARN', evidenceThreshold: .83 }] };
  const before = JSON.stringify(legacy);
  for (const schemaVersion of [1, 2, 3, 4]) {
    assert.deepEqual(recordedOrigin(schemaVersion, legacy.rules[0]!, legacy), { role: null, source: legacy.source, target: legacy.target, digest: legacy.digest, line: 7 });
    assert.equal(recordedPolicyIdentity(schemaVersion, legacy), JSON.stringify([legacy.source, legacy.digest, legacy.target]));
  }
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(validPolicySnapshot(legacy), false);
});
