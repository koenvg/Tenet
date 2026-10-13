import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

for (const scenario of ['success', 'bind-failure']) {
  test(`development inspector ${scenario} owns and releases isolated listeners`, async (t) => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-inspector-dev-')));
    try {
      // A stuck startup or teardown cannot retain listeners in the suite process.
      // Kill only this fixture child; its phase output identifies bounded failures.
      const child = spawnSync('bun', ['--no-env-file', fileURLToPath(new URL('./inspector-dev-fixture.ts', import.meta.url)), scenario, directory], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, killSignal: 'SIGKILL',
      });
      t.diagnostic(child.stdout?.trim() ?? 'no child phase output');
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stderr);
      assert.doesNotMatch(child.stderr, /Failed to run dependency scan|The server is being restarted or closed/);
      assert.match(child.stdout, new RegExp(`${scenario}: ports released`));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
