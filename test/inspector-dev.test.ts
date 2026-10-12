import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
      const output = execFileSync('bun', ['--no-env-file', fileURLToPath(new URL('./inspector-dev-fixture.ts', import.meta.url)), scenario, directory], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, killSignal: 'SIGKILL',
      });
      t.diagnostic(output.trim());
      assert.match(output, new RegExp(`${scenario}: ports released`));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
