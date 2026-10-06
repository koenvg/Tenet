import assert from 'node:assert/strict';
import { mkdir, realpath, writeFile, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGuard } from 'tenet';

const [installation, project, scenario, expectedHome] = process.argv.slice(2);
assert.ok(isAbsolute(expectedHome) && expectedHome.includes('tenet-relocated-'));
assert.equal(await realpath(expectedHome), expectedHome);
assert.equal(homedir(), expectedHome);
assert.equal(process.cwd(), project);
assert.notEqual(project, installation);
assert.equal(process.env.TENET_POLICY, undefined);
for (const key of ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'NODE_OPTIONS', 'NODE_PATH'])
  assert.equal(process.env[key], undefined, `${key} must not be inherited`);
globalThis.fetch = async () => { throw new Error('live requests forbidden'); };
const global = join(expectedHome, '.tenet/TENET.md'), local = join(project, 'TENET.md');
await mkdir(join(expectedHome, '.tenet'), { recursive: true, mode: 0o700 });
const globalText = 'Rule; Never publish the global dummy value.\n';
const projectText = 'Rule; Ask before publishing the project dummy value.\n';
const override = join(project, 'reviewed.md');
const hasGlobal = scenario !== 'project-only' && scenario !== 'none';
if (hasGlobal) await writeFile(global, scenario === 'empty-global' ? '' : scenario === 'malformed-global' ? 'Rule;\n' : globalText);
if (['combined', 'project-only', 'relative-override', 'absolute-override', 'empty-global', 'malformed-global', 'broken-global'].includes(scenario))
  await writeFile(local, projectText);
if (scenario === 'broken-global') {
  const { unlink } = await import('node:fs/promises');
  await unlink(global); await symlink(join(expectedHome, 'missing-target'), global);
}
if (scenario.endsWith('-override') && scenario !== 'empty-override') await writeFile(override, 'Rule; WARN; Override dummy value.\n');
const selection = scenario === 'relative-override' ? './reviewed.md' : scenario === 'absolute-override' ? override
  : scenario === 'missing-project' ? './missing.md' : scenario === 'empty-override' ? ' ' : undefined;
const invalid = ['empty-global', 'malformed-global', 'broken-global', 'missing-project', 'empty-override'].includes(scenario);
const roles = scenario === 'none' ? [] : scenario === 'project-only' ? ['project'] : scenario === 'global-only' ? ['global']
  : invalid ? [] : ['global', 'project'];
let submissions = 0;
const judge = async request => {
  submissions++;
  assert.deepEqual(request.policy.sources.map(s => s.role), roles);
  assert.deepEqual(request.policy.rules.map(r => r.origin.role), roles);
  assert.equal(request.cwd, project);
  assert.ok(request.policy.rules.every(r => r.id.startsWith(`${r.origin.role}:${r.origin.digest}:`)));
  const rule = (id, integrity = false) => ({ ruleId: id,
    outcome: { choice: 'PASS', probabilities: { PASS: 1, APPROVAL_REQUIRED: 0, FAIL: 0, UNKNOWN: 0, ...(integrity ? {} : { NOT_APPLICABLE: 0 }) } },
    evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } });
  return { profile: 'applicability-v1', model: 'offline-source-script',
    rules: [...request.policy.rules.map(r => rule(r.id)), rule('builtin:policy-integrity', true)] };
};
for (const mode of ['observe', 'enforce']) {
  const env = { TENET_MODE: mode, TENET_RECORDING: 'off', ...(selection === undefined ? {} : { TENET_POLICY: selection }) };
  const guard = createGuard({ host: 'relocated-policy', env, judge, controlPath: join(expectedHome, 'control.json') });
  try {
    const identity = { sessionId: `${scenario}-${mode}`, contextId: 'main' };
    const session = guard.openSession(identity, project);
    const status = await session.ready;
    assert.equal(status.state, invalid ? 'unavailable' : scenario === 'none' ? 'dormant' : 'ready');
    assert.equal(status.policy.contractVersion, 'policy-sources-v1');
    assert.deepEqual(status.policy.sources.map(s => s.role), roles);
    assert.equal(status.policy.ruleCount, roles.length);
    assert.equal(status.policy.candidates[0].source, global);
    assert.equal(status.policy.candidates[1].source, selection === ' ' ? '' : selection === undefined ? local : selection.startsWith('/') ? selection : join(project, selection));
    for (const source of status.policy.sources) {
      assert.equal(source.ruleCount, 1); assert.match(source.digest, /^[a-f0-9]{64}$/);
      assert.ok(!source.source.startsWith(installation));
    }
    if (roles.length) assert.match(status.policy.combinedDigest, /^[a-f0-9]{64}$/);
    else assert.equal(status.policy.combinedDigest, null);
    const before = submissions;
    const call = { callId: 'dummy', toolName: 'dummy', input: { value: 'harmless' } };
    const result = await session.beforeTool({ ...call, current: () => ({ ...identity, ...call }) });
    assert.equal(result.permission, invalid && mode === 'enforce' ? 'blocked' : 'released');
    if (invalid || scenario === 'none') assert.equal(submissions, before, 'invalid or dormant sources never reach the judge');
    await session.close();
    // Doctor uses the same process home and project selection, with a dummy credential only for presence.
    const runtime = process.versions.bun ? 'bun' : 'node';
    const args = [...(runtime === 'bun' ? ['--no-env-file'] : []), join(installation, 'dist/cli/index.js'), 'doctor', '--project', project, '--json'];
    const diagnosis = spawnSync(runtime, args, { cwd: project, env: { ...process.env, ...env, TYPESAFE_API_KEY: 'offline-presence-only' }, encoding: 'utf8' });
    assert.equal(diagnosis.status, invalid ? 1 : 0, `${diagnosis.stderr}\n${diagnosis.stdout}`);
    const report = JSON.parse(diagnosis.stdout);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.state, invalid ? 'invalid' : scenario === 'none' ? 'dormant' : 'ready');
    for (const field of ['contractVersion', 'sources', 'combinedDigest', 'ruleCount'])
      assert.deepEqual(report.policy[field], status.policy[field]);
    assert.deepEqual(report.policy.candidates, status.policy.candidates.map(({ role, selection, source, presence }) => ({ role, selection, source, presence })));
    assert.equal(report.policy.validation, invalid ? 'invalid' : roles.length ? 'valid' : 'absent');
    if (invalid) {
      assert.equal(report.policy.reason, status.policy.reason);
      assert.equal(report.policy.failedRole, status.policy.failedRole);
    }
    assert.equal(report.hooks, 'unverified'); assert.equal(report.provider, 'unverified'); assert.equal(report.assessment, 'not-requested');
  } finally { await guard.close(); }
}
console.log(`${process.versions.bun ? 'Bun' : 'Node'} relocated ${scenario}: source-aware SDK/doctor, isolated owner home and session cwd, both modes, no live requests.`);
