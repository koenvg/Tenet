import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lstat, stat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { selectPolicies } from '../src/runtime/policy-selection.js';
import { readConfig } from '../src/runtime/config.js';
import { isolatedHome } from './isolated-home.js';

for (const mode of ['observe', 'enforce'] as const) {
  test(`selector ${mode}: no parent search or environment-map home override`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenet-selection-'));
    try {
      const cwd = join(root, 'project');
      await mkdir(cwd);
      const env = { ...await isolatedHome(root), TENET_MODE: mode };
      await mkdir(join(env.HOME, '.tenet'));
      await writeFile(join(env.HOME, '.tenet/TENET.md'), 'Rule; synthetic home rule');
      await writeFile(join(root, 'TENET.md'), 'Rule; parent rule');
      assert.equal((await selectPolicies(cwd, env)).eligible, false);
      await writeFile(join(cwd, 'TENET.md'), 'Rule; local rule');
      const absolute = join(root, 'selected.md');
      await writeFile(absolute, 'Rule; selected rule');
      for (const value of [undefined, '../selected.md', absolute, 'missing.md', '', ' \t ']) {
        const selectedEnv = { ...env, TENET_POLICY: value };
        const selected = await selectPolicies(cwd, selectedEnv);
        assert.equal(selected.eligible, true);
        const project = selected.candidates[1]!;
        assert.equal(project.selection, value === undefined ? 'local' : 'explicit');
        if (value !== undefined && !value.trim()) {
          assert.equal(project.failure, 'configuration');
          assert.equal(project.source, '');
          assert.throws(() => readConfig(cwd, selectedEnv), /configuration/);
        } else {
          assert.equal(project.source, resolve(cwd, value ?? 'TENET.md'));
          assert.equal(readConfig(cwd, selectedEnv).policyPath, project.source);
          assert.equal(project.presence, value === 'missing.md' ? 'absent' : 'present');
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  for (const code of ['EACCES', 'EIO', 'ENOTDIR', 'ELOOP', undefined]) {
    test(`selector ${mode}: filesystem uncertainty ${code} never implies dormancy`, async () => {
      const selected = await selectPolicies('/offline/project', { TENET_MODE: mode }, {
        lstat: async () => { throw Object.assign(new Error('injected'), { code }); }, stat,
      });
      assert.equal(selected.eligible, true);
      for (const candidate of selected.candidates) {
        assert.equal(candidate.failure, 'policy-unavailable');
        assert.equal(candidate.presence, 'unavailable');
      }
    });
  }

  test(`selector ${mode}: broken candidate and ancestor links remain eligible`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'tenet-selection-links-'));
    try {
      const env = { ...await isolatedHome(root), TENET_MODE: mode };
      await symlink('missing', join(root, 'TENET.md'));
      assert.equal((await selectPolicies(root, env)).eligible, true);
      await symlink('missing-directory', join(root, 'broken-parent'));
      const selected = await selectPolicies(join(root, 'broken-parent', 'nested'), env);
      assert.equal(selected.eligible, true);
      assert.equal(selected.candidates[1]!.failure, 'policy-unavailable');
      assert.equal(selected.candidates[1]!.presence, 'unavailable');
      const accessed: string[] = [];
      const absent = await selectPolicies(root, { ...env, TENET_POLICY: '' }, {
        lstat: async path => { accessed.push(String(path)); return lstat(path); }, stat,
      });
      assert.equal(absent.candidates[1]!.failure, 'configuration');
      assert.ok(accessed.length > 0, 'global candidate is still selected');
      assert.ok(!accessed.includes(join(root, 'TENET.md')), 'invalid override cannot probe a project fallback');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
