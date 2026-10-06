import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

for (const mode of ['observe', 'enforce']) {
  for (const scenario of ['selection', 'freshness', 'home-mismatch', 'limits', 'conflicts', 'in-flight', 'dormant']) {
    test(`global policy ${mode}: ${scenario} through isolated SDK/Pi/doctor/hook boundaries`, async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'tg-')));
      const home = join(root, 'home'); await mkdir(home);
      try {
        const output = execFileSync('bun', [resolve('test/global-policy-fixture.ts'), scenario, mode, root], {
          env: { PATH: process.env.PATH, HOME: home, TMPDIR: '/tmp' }, encoding: 'utf8', timeout: 30000,
        });
        assert.match(output, /Global policy fixture passed/);
      } finally { await rm(root, { recursive: true, force: true }); }
    });
  }
}
