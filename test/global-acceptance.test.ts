import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

for (const mode of ['observe', 'enforce']) for (const scenario of ['invalid-sources', 'stale-consent', 'integrity-paths']) {
  test(`whole-feature ${mode}: ${scenario} in a disposable process home`, async () => {
    const root = await realpath(await mkdtemp('/tmp/ta-'));
    const home = join(root, 'home'); await mkdir(home, { mode: 0o700 });
    try {
      const output = execFileSync('bun', ['--no-env-file', resolve('test/global-acceptance-fixture.ts'), scenario, mode, root], {
        env: { PATH: process.env.PATH, HOME: home, TMPDIR: '/tmp' }, encoding: 'utf8', timeout: 30000,
      });
      assert.match(output, /Whole-feature fixture passed/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
