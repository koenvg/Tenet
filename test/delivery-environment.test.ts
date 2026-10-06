import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, symlink, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isolatedEnvironment, isolatedArgs } from '../scripts/isolated-environment.js';

test('delivery subprocesses use validated homes and cannot load dotenv credentials', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-env-')));
  try {
    const home = join(root, 'home'), env = await isolatedEnvironment(root, home);
    for (const key of ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TENET_POLICY', 'NODE_OPTIONS', 'NODE_PATH', 'SSH_AUTH_SOCK'])
      assert.equal(env[key], undefined);
    await writeFile(join(root, '.env'), 'TYPESAFE_API_KEY=dotenv-sentinel\nTENET_POLICY=dotenv-policy\n');
    for (const runtime of ['node', 'bun']) {
      const output = execFileSync(runtime, isolatedArgs(runtime, ['-e',
        "console.log(JSON.stringify({home:require('node:os').homedir(),key:process.env.TYPESAFE_API_KEY,policy:process.env.TENET_POLICY}))"]),
        { cwd: root, env, encoding: 'utf8' });
      assert.deepEqual(JSON.parse(output), { home });
    }
    await symlink(home, join(root, 'alias'));
    await assert.rejects(isolatedEnvironment(root, join(root, 'alias')), /realpath/);
    await assert.rejects(isolatedEnvironment(root, root), /inside fixture root/);
    await assert.rejects(isolatedEnvironment(root, join(root, '..', 'outside')), /inside fixture root/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
