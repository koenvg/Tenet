import assert from 'node:assert/strict';
import { mock } from 'node:test';
import native from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const [role, scenario, root] = process.argv.slice(2);
assert.ok(root && scenario && (role === 'global' || role === 'project'));
assert.equal(homedir(), await native.realpath(join(root, 'home')));
for (const key of ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TENET_POLICY']) assert.equal(process.env[key], undefined);
globalThis.fetch = async () => { throw new Error('network forbidden'); };

// Capture native functions before mocking. Each fault stays in this child process.
const { lstat, stat } = native;
let fault: { operation: 'lstat' | 'stat'; path: string; code?: string } | undefined;
let missingRoot = false;
const check = (operation: 'lstat' | 'stat', path: unknown) => {
  if (missingRoot || (fault?.operation === operation && fault.path === path)) {
    throw Object.assign(new Error('injected filesystem uncertainty'), { code: missingRoot ? 'ENOENT' : fault?.code });
  }
};
mock.method(native, 'lstat', (path: Parameters<typeof lstat>[0]) => { check('lstat', path); return lstat(path); });
mock.method(native, 'stat', (path: Parameters<typeof stat>[0]) => { check('stat', path); return stat(path); });
syncBuiltinESMExports();
const { selectPolicies } = await import('../dist/runtime/policy-selection.js');
const { loadPolicy, policyIsCurrent } = await import('../dist/decision/policy.js');

const cwd = role === 'project' ? join(root, 'project', 'nested') : join(root, 'project');
const global = join(homedir(), '.tenet', 'TENET.md');
const project = join(cwd, 'TENET.md');
const source = role === 'global' ? global : project;
const other = role === 'global' ? project : global;
const parent = dirname(source);
await native.mkdir(dirname(other), { recursive: true });
await native.writeFile(other, 'Rule; Keep fixture data local.');
const before = await selectPolicies(cwd, {});
assert.equal(before.eligible, true);
assert.deepEqual(before.candidates.map(c => c.role), ['global', 'project']);
assert.equal(before.candidates.find(c => c.role === role)!.presence, 'absent');
const active = await loadPolicy(before.candidates);
assert.ok(active.available);
assert.equal(await policyIsCurrent(active), true);
assert.deepEqual(active.sources.map(s => s.role), [role === 'global' ? 'project' : 'global']);

if (scenario === 'missing-intermediates') {
  // Adding directories alone does not change selected candidate presence or identity.
  await native.mkdir(parent, { recursive: true });
} else if (scenario === 'directory-link' || scenario.startsWith('link-')) {
  const target = join(root, 'directory-target'); await native.mkdir(target);
  await native.mkdir(dirname(parent), { recursive: true }); await native.symlink(target, parent);
  if (scenario.startsWith('link-')) fault = { operation: 'stat', path: parent, code: scenario.slice(5) };
} else if (scenario === 'appearance' || scenario === 'broken-source') {
  await native.mkdir(parent, { recursive: true });
  if (scenario === 'appearance') await native.writeFile(source, 'Rule; Keep fixture data local.');
  else await native.symlink('missing-target', source);
} else if (scenario === 'broken-ancestor' || scenario === 'file-ancestor') {
  await native.mkdir(dirname(parent), { recursive: true });
  if (scenario === 'broken-ancestor') await native.symlink('missing-directory', parent);
  else await native.writeFile(parent, 'not a directory');
} else if (scenario === 'missing-root') {
  missingRoot = true;
} else {
  const [location, code] = scenario.split('-');
  assert.ok(location === 'source' || location === 'ancestor');
  fault = { operation: 'lstat', path: location === 'source' ? source : parent, code: code === 'unknown' ? undefined : code };
}

const selected = await selectPolicies(cwd, {});
const optional = selected.candidates.find(c => c.role === role)!;
const stillAbsent = scenario === 'missing-intermediates' || scenario === 'directory-link';
assert.equal(optional.presence, stillAbsent ? 'absent' : ['appearance', 'broken-source'].includes(scenario) ? 'present' : 'unavailable');
assert.equal(selected.eligible, true, 'a valid other source or an uncertain candidate must keep selection eligible');
assert.equal(await policyIsCurrent(active), stillAbsent, 'uncertainty or candidate appearance invalidates the full active snapshot');
const reloaded = await loadPolicy(selected.candidates);
if (stillAbsent) {
  assert.ok(reloaded.available);
  assert.equal(reloaded.combinedDigest, active.combinedDigest);
  await native.unlink(other);
  const dormant = await selectPolicies(cwd, {});
  assert.equal(dormant.eligible, false);
  assert.deepEqual(dormant.candidates.map(c => c.presence), ['absent', 'absent']);
} else if (scenario === 'appearance') {
  assert.ok(reloaded.available);
  assert.deepEqual(reloaded.sources.map(s => s.role), ['global', 'project']);
  assert.notEqual(reloaded.combinedDigest, active.combinedDigest);
} else {
  assert.equal(reloaded.available, false, 'the other valid source cannot yield a partial policy');
  if (!reloaded.available) assert.equal(reloaded.reason, 'policy-unavailable');
}
console.log('Policy presence fixture passed');
