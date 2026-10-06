import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, realpath, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPolicy, policyIsCurrent, POLICY_LIMITS } from '../src/decision/policy.js';

import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { answer, ruleAnswer } from './helpers.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import { Consequences } from '../src/runtime/consequences.js';
async function fixture(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp('/tmp/tenet46-policy-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const candidate = (role: 'global' | 'project', source: string, presence: 'present' | 'absent' = 'present') => ({ role, source, selection: 'local' as const, presence });

test('project loader returns only the immutable current source-set contract', async () => fixture(async root => {
  const file = join(root, 'project.md'); await writeFile(file, '# heading\nRule; WARN; evidenceThreshold=0.92; Keep small.');
  const p = await loadPolicy(file); assert.ok(p.available);
  assert.equal(p.contractVersion, 'policy-sources-v1');
  assert.equal(p.sources[0]!.role, 'project'); assert.equal(p.sources[0]!.bytes, 57);
  assert.equal(p.rules[0]!.id, `project:${p.sources[0]!.digest}:2`);
  assert.deepEqual(p.rules[0]!.origin, { role: 'project', source: file, target: file, digest: p.sources[0]!.digest, line: 2 });
  assert.equal(p.rules[0]!.evidenceThreshold, 0.92);
  assert.ok(!('source' in p) && !('digest' in p) && !('target' in p));
  for (const v of [p, p.candidates, p.candidates[0], p.sources, p.sources[0]!, p.sources[0]!.rules, p.rules, p.rules[0]!, p.rules[0]!.origin]) assert.ok(Object.isFrozen(v));
}));

test('identical files and shared targets retain distinct global-first declarations', async () => fixture(async root => {
  const g = join(root, 'g.md'), p = join(root, 'p.md');
  await writeFile(g, '# heading\nRule; BLOCK; evidenceThreshold=0.94; Same.'); await writeFile(p, await import('node:fs/promises').then(fs => fs.readFile(g)));
  for (const project of [p, g]) {
    const inputs = [candidate('project', project), candidate('global', g)];
    const a = await loadPolicy(inputs), b = await loadPolicy([...inputs].reverse()); assert.ok(a.available && b.available);
    assert.deepEqual(a, b); assert.deepEqual(a.rules.map(r => r.origin.role), ['global', 'project']);
    assert.equal(new Set(a.rules.map(r => r.id)).size, 2); assert.equal(a.sources[0]!.digest, a.sources[1]!.digest);
    assert.equal(a.bytes, a.sources[0]!.bytes * 2); assert.equal(await policyIsCurrent(a), true);
  }
}));

test('combined identity covers candidate presence, configured paths, targets and bytes', async () => fixture(async root => {
  const g = join(root, 'g.md'), p = join(root, 'p.md'), link = join(root, 'link.md');
  await writeFile(g, 'Rule; Same.'); await writeFile(p, 'Rule; Same.'); await symlink(g, link);
  const a = await loadPolicy([candidate('global', g), candidate('project', p, 'absent')]); assert.equal(a.available, false);
  await unlink(p);
  const b = await loadPolicy([candidate('global', link), candidate('project', p, 'absent')]); assert.ok(b.available);
  await writeFile(p, 'Rule; Same.'); assert.equal(await policyIsCurrent(b), false);
  const c = await loadPolicy([candidate('global', link), candidate('project', p)]); assert.ok(c.available); assert.notEqual(c.combinedDigest, b.combinedDigest);
  await unlink(link); await symlink(p, link); assert.equal(await policyIsCurrent(c), false);
  const d = await loadPolicy([candidate('global', link), candidate('project', p)]); assert.ok(d.available); assert.notEqual(d.combinedDigest, c.combinedDigest);
  await writeFile(p, 'Rule; Changed.'); assert.equal(await policyIsCurrent(d), false);
}));

test('limits apply to the full set and an invalid source never yields a partial policy', async () => fixture(async root => {
  const g = join(root, 'g.md'), p = join(root, 'p.md');
  const load = () => loadPolicy([candidate('global', g), candidate('project', p)]);
  await writeFile(g, Array(8).fill('Rule; Same.').join('\n')); await writeFile(p, Array(8).fill('Rule; Same.').join('\n'));
  assert.equal((await load()).available, true);
  await writeFile(p, Array(9).fill('Rule; Same.').join('\n')); const failed = await load(); assert.ok(!failed.available); assert.equal(failed.reason, 'policy-rule-count-limit');
  for (const delta of [0, 1]) {
    await writeFile(g, 'Rule; ok\n' + 'x'.repeat(POLICY_LIMITS.fileBytes / 2 - 9));
    await writeFile(p, 'Rule; ok\n' + 'x'.repeat(POLICY_LIMITS.fileBytes / 2 - 9 + delta));
    assert.equal((await load()).available, delta === 0);
  }
  for (const text of ['', 'Rule; ', 'Rule; ' + 'x'.repeat(4097)]) { await writeFile(p, text); assert.equal((await load()).available, false); }
  assert.equal((await loadPolicy([candidate('project', g), candidate('project', p)])).available, false);
}));

test('explicit composition retains independent thresholds, WARN, prohibitions and approval gates', async () => fixture(async root => {
  const global = join(root, 'global.md'), project = join(root, 'project.md');
  for (const advisory of [false, true]) {
    await writeFile(global, `Rule; ${advisory ? 'WARN' : 'BLOCK'}; evidenceThreshold=0.95; Require careful review.`);
    await writeFile(project, 'Rule; BLOCK; evidenceThreshold=0.75; Permit this action.');
    const policy = await loadPolicy([candidate('project', project), candidate('global', global)]); assert.ok(policy.available);
    const action = captureAction({ sessionId: 's', callId: 'c', toolName: 'edit', arguments: {} });
    const response: import('../src/decision/contracts.js').Assessment = answer(policy);
    response.rules = response.rules.map(rule => rule.ruleId === INTEGRITY_ID ? rule : { ...rule,
      evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: .85, INSUFFICIENT: .15 } } });
    const result = await decide({ policy, action, cwd: root, judge: async request => {
      assert.deepEqual(request.policy.rules.map(rule => rule.origin.role), ['global', 'project']);
      return response;
    } });
    assert.equal(result.decision, advisory ? 'ALLOW' : 'BLOCK');
    assert.deepEqual(result.diagnostics.map(d => [d.ruleId, d.evidenceThreshold]), [[policy.rules[0]!.id, .95]]);
    const consequences = new Consequences('enforce', policy); consequences.assessed(result);
    const permission = consequences.permission(result.decision === 'BLOCK' ? result.reason : undefined);
    assert.equal(permission.rules[0]!.origin.role, 'global');
    if (!advisory) assert.match(consequences.veto(permission)!.reason, /global line 1/);
    const prohibition = answer(policy); prohibition.rules[0] = ruleAnswer(policy.rules[0]!.id, 'FAIL');
    assert.equal((await decide({ policy, action, cwd: root, judge: async () => prohibition })).decision, advisory ? 'ALLOW' : 'BLOCK');
    const approval = answer(policy);
    approval.rules[0] = ruleAnswer(policy.rules[0]!.id, 'APPROVAL_REQUIRED');
    assert.equal((await decide({ policy, action, cwd: root, judge: async () => approval })).decision, advisory ? 'ALLOW' : 'ASK');
    approval.rules[2] = ruleAnswer(INTEGRITY_ID, 'FAIL');
    const integrity = await decide({ policy, action, cwd: root, judge: async () => approval });
    assert.equal(integrity.decision, 'BLOCK'); assert.equal(integrity.reason, 'policy-integrity');
  }
}));
