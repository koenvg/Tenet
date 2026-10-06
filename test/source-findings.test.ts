import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPolicy } from '../src/decision/policy.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { createJevJudge } from '../src/decision/jev.js';
import { ArchiveWriter, readArchive } from '../src/recording/archive.js';
import { ruleContributions } from '../src/recording/rules.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { invocationView } from '../src/inspector/view.js';
import { findingsSchema } from '../bb-plugin-tenet-status/contract.js';
import { answer, sdkAnswers } from './helpers.js';

for (const roles of [['global'], ['project'], ['global', 'project']] as const) {
  test(`current ${roles.join('+')} findings survive source removal in inspector and BB readers`, async () => {
    const root = await realpath(await mkdtemp('/tmp/tenet49-readers-'));
    const directory = join(root, 'archive'), thread = 'thr_acceptance49';
    const candidates = ['global', 'project'].map(role => ({ role: role as 'global' | 'project', source: join(root, `${role}.md`),
      selection: 'local' as const, presence: (roles.some(value => value === role) ? 'present' : 'absent') as 'present' | 'absent' }));
    try {
      for (const c of candidates.filter(c => c.presence === 'present')) await writeFile(c.source, '# physical line\nRule; BLOCK; evidenceThreshold=0.83; Same recorded declaration.');
      const policy = await loadPolicy(candidates); assert.ok(policy.available);
      const writer = new ArchiveWriter({ enabled: true, directory });
      const sink = writer.bind({ host: 'pi', contextId: 'main', sessionId: 's', callId: 'c', invocationId: 'i', toolName: 'fixture',
        cwd: root, mode: 'observe', bbThreadId: thread });
      sink('begin', { policy, config: { effectThreshold: .91, evidenceThreshold: .92 } });
      const result = await decide({ policy, action: captureAction({ sessionId: 's', callId: 'c', toolName: 'fixture', arguments: {} }),
        cwd: root, recording: sink, config: { effectThreshold: .91, evidenceThreshold: .92 },
        judge: createJevJudge({ apiKey: 'offline', fetch: async () => Response.json({ model: 'scripted', answers: sdkAnswers(answer(policy, 'FAIL')) }) }) });
      sink('assessment', { ...result }); sink('decision', { ...result, contributions: ruleContributions(result, policy) });
      sink('permission', { outcome: 'released' }); sink('execution', { outcome: 'unknown' }); await writer.close();
      const before = await readArchive(directory); assert.deepEqual(before.issues, []);
      for (const c of candidates.filter(c => c.presence === 'present')) await rm(c.source);
      const after = await readArchive(directory); assert.deepEqual(after, before, 'reading history never rewrites or reloads current policy');
      const view = invocationView(after.records);
      assert.deepEqual(view.rules.filter(r => !r.builtin).map(r => [r.id, r.origin, r.thresholds.evidenceThreshold]),
        policy.rules.map(r => [r.id, r.origin, .83]));
      assert.equal(view.permission, 'released'); assert.equal(view.execution, 'unknown'); assert.equal(view.decision, 'BLOCK');
      const index = new ArchiveIndex(directory); await index.refresh();
      const findings = await index.threadFindings(thread);
      assert.ok(findingsSchema.safeParse(findings).success, 'public BB contract accepts current role-qualified findings');
      assert.equal(findings.items.length, 1);
      assert.deepEqual(findings.items[0]!.rules.filter(r => r.kind === 'policy').map(r => [r.ruleId, r.origin]), policy.rules.map(r => [r.id, r.origin]));
      assert.equal(findings.items[0]!.actualPermission, 'released'); assert.equal(findings.items[0]!.observedExecution, 'unknown');
      assert.equal(index.threadStatus(thread).failures, 1, 'two identical declarations still form one flagged call');
      assert.equal(new Set(view.rules.map(r => r.id)).size, policy.rules.length + 1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('an unavailable combined snapshot cannot become a passing inspector or BB finding', async () => {
  const root = await realpath(await mkdtemp('/tmp/tenet49-unavailable-'));
  try {
    const candidates = ['global', 'project'].map(role => ({ role: role as 'global' | 'project', source: join(root, `${role}.md`), selection: 'local' as const, presence: 'present' as const }));
    await writeFile(candidates[0]!.source, 'Rule; valid global'); await writeFile(candidates[1]!.source, 'Rule;');
    const policy = await loadPolicy(candidates); assert.ok(!policy.available);
    const directory = join(root, 'archive'); await mkdir(directory, { mode: 0o700 });
    const writer = new ArchiveWriter({ enabled: true, directory });
    const sink = writer.bind({ host: 'pi', contextId: 'main', sessionId: 's', callId: 'c', invocationId: 'i', toolName: 'fixture', cwd: root, mode: 'observe', bbThreadId: 'thr_acceptance49' });
    sink('begin', { policy }); sink('assessment-status', { status: 'unavailable', reason: policy.reason });
    sink('permission', { outcome: 'released', reason: policy.reason }); await writer.close();
    const archive = await readArchive(directory); assert.deepEqual(archive.issues, []);
    const view = invocationView(archive.records);
    assert.equal(view.policy.failedRole, 'project'); assert.deepEqual(view.rules, []);
    assert.equal(view.permission, 'released'); assert.equal(view.noRulesClassifiedViolated, false);
    const index = new ArchiveIndex(directory); await index.refresh();
    assert.equal(index.threadStatus('thr_acceptance49').failures, 0);
    const findings = await index.threadFindings('thr_acceptance49'); assert.deepEqual(findings.items, []);
    assert.notEqual(findings.coverage, 'complete');
  } finally { await rm(root, { recursive: true, force: true }); }
});
