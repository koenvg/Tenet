import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('archive metadata retains bounded previews within an 8 MiB heap budget', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-preview-memory-test-')));
  try {
    const bundle = join(root, 'fixture.mjs');
    const build = spawnSync('bun', ['--no-env-file', 'build', '--target=node', '--outfile', bundle,
      fileURLToPath(new URL('./inspector-preview-memory-fixture.ts', import.meta.url))], { encoding: 'utf8', timeout: 30000 });
    assert.ifError(build.error);
    assert.equal(build.status, 0, build.stderr);
    const child = spawnSync('node', ['--expose-gc', bundle], { encoding: 'utf8', timeout: 30000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.calls, 32);
    assert.equal(result.rules, 512);
    assert.deepEqual(result.phases.map((phase: { phase: string }) => phase.phase), ['baseline', 'indexed', 'released']);
    const retainedBytes = result.phases[1].heapUsed - result.phases[0].heapUsed;
    console.log(JSON.stringify({ ...result, retainedBytes, budgetBytes: 8 * 1024 * 1024 }));
    assert.ok(Number.isFinite(retainedBytes) && retainedBytes <= 8 * 1024 * 1024,
      `32 requests with 512 rule previews retained ${retainedBytes} bytes, exceeding the 8 MiB heap budget`);
  } finally { await rm(root, { recursive: true, force: true }); }
});
