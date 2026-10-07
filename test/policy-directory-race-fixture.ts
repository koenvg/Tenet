import assert from 'node:assert/strict';
import { mock } from 'node:test';
import native from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const [role, scenario, root] = process.argv.slice(2);
assert.ok(root && scenario && (role === 'global' || role === 'project'));
assert.equal(homedir(), await native.realpath(join(root, 'home')));
assert.equal(process.env.TYPESAFE_API_KEY, undefined);
assert.equal(process.env.TENET_POLICY, undefined);
globalThis.fetch = async () => { throw new Error('network forbidden'); };

const higher = scenario.startsWith('higher-');
const change = higher ? scenario.slice(7) : scenario;
const cwd = role === 'global' ? join(root, 'project') : higher
  ? join(root, 'project', 'nested', 'deeper') : join(root, 'project', 'nested');
const global = join(homedir(), '.tenet', 'TENET.md');
const project = join(cwd, 'TENET.md');
const source = role === 'global' ? global : project;
const other = role === 'global' ? project : global;
const parent = dirname(source);
const raceParent = higher ? join(root, 'project') : parent;
const changedPath = higher ? join(raceParent, 'nested') : parent;
await native.mkdir(dirname(other), { recursive: true });
await native.writeFile(other, 'Rule; Keep fixture data local.');

// Schedule the real directory change after stat observed ENOENT but before its rejection reaches the caller.
// Native filesystem faults and mutations are confined to this disposable child process.
const { stat, lstat } = native;
let armed = false, changes = 0, nativeMisses = 0, uncertain = false;
mock.method(native, 'stat', async (path: Parameters<typeof stat>[0]) => {
  if (armed && String(path) === raceParent) {
    armed = false; changes++;
    let missing: unknown;
    try { await stat(path); } catch (error) { missing = error; }
    assert.equal((missing as NodeJS.ErrnoException | undefined)?.code, 'ENOENT');
    nativeMisses++;
    await native.mkdir(dirname(raceParent), { recursive: true });
    if (higher) await native.mkdir(raceParent);
    if (change === 'broken-link') await native.symlink('missing-directory', changedPath);
    else if (change === 'file') await native.writeFile(changedPath, 'not a directory');
    else if (change === 'directory-link') {
      const target = join(root, 'directory-target'); await native.mkdir(target);
      await native.symlink(target, changedPath);
    } else {
      if (!higher) await native.mkdir(parent);
      if (change === 'policy-appears') {
        await native.mkdir(parent, { recursive: true });
        await native.writeFile(source, 'Rule; Newly selected policy.');
      }
      uncertain = change === 'io-uncertainty';
    }
    throw missing;
  }
  return stat(path);
});
mock.method(native, 'lstat', (path: Parameters<typeof lstat>[0]) => {
  if (uncertain && String(path) === changedPath) throw Object.assign(new Error('injected filesystem uncertainty'), { code: 'EIO' });
  return lstat(path);
});
syncBuiltinESMExports();
const { selectPolicies } = await import('../dist/runtime/policy-selection.js');
const { loadPolicy, policyIsCurrent } = await import('../dist/decision/policy.js');
const selected = await selectPolicies(cwd, {});
assert.equal(selected.candidates.find(c => c.role === role)!.presence, 'absent');
const active = await loadPolicy(selected.candidates);
assert.ok(active.available);
assert.equal(await policyIsCurrent(active), true);

armed = true;
const stillAbsent = change === 'directory' || change === 'directory-link';
assert.equal(await policyIsCurrent(active), stillAbsent, 'only directory changes without a policy preserve the snapshot');
assert.equal(changes, 1, 'the scheduled missing-parent race must execute');
assert.equal(nativeMisses, 1, 'native stat must observe ENOENT before the directory changes');
if (stillAbsent) {
  const reloaded = await loadPolicy(selected.candidates);
  assert.ok(reloaded.available);
  assert.equal(reloaded.combinedDigest, active.combinedDigest);
}
console.log('Policy directory race fixture passed');
