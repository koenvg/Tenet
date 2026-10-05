import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const scenarios = ['missing-intermediates', 'directory-link', 'appearance', 'broken-source', 'broken-ancestor', 'file-ancestor',
  'source-EACCES', 'source-EIO', 'ancestor-EACCES', 'ancestor-EIO', 'link-EACCES', 'link-EIO', 'ancestor-unknown', 'missing-root'];

for (const role of ['global', 'project']) for (const scenario of scenarios) {
  test(`policy presence ${role}: ${scenario} agrees across selection and active freshness`, async () => {
    const root = await realpath(await mkdtemp('/tmp/tenet-presence-'));
    const home = join(root, 'home'); await mkdir(home);
    try {
      const output = execFileSync('node', ['--experimental-strip-types', resolve('test/policy-presence-fixture.ts'), role, scenario, root], {
        env: { PATH: process.env.PATH, HOME: home, TMPDIR: '/tmp' }, encoding: 'utf8', timeout: 30000,
      });
      assert.match(output, /Policy presence fixture passed/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
