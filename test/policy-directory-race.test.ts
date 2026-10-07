import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

for (const role of ['global', 'project']) {
  const scenarios = ['directory', 'policy-appears', 'broken-link', 'file', 'io-uncertainty'];
  if (role === 'project') scenarios.push('higher-directory', 'higher-policy-appears', 'higher-broken-link',
    'higher-file', 'higher-io-uncertainty', 'higher-directory-link');
  for (const scenario of scenarios) {
    test(`policy freshness ${role}: ${scenario} during missing-parent inspection`, async () => {
      const root = await realpath(await mkdtemp('/tmp/tenet-policy-race-'));
      const home = join(root, 'home'); await mkdir(home);
      try {
        const output = execFileSync('node', ['--experimental-strip-types', resolve('test/policy-directory-race-fixture.ts'), role, scenario, root], {
          env: { PATH: process.env.PATH, HOME: home, TMPDIR: '/tmp' }, encoding: 'utf8', timeout: 30000,
        });
        assert.match(output, /Policy directory race fixture passed/);
      } finally { await rm(root, { recursive: true, force: true }); }
    });
  }
}
