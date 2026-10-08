import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFakePluginHost, experimental_scanPublicSdkOnly } from '@get-bb/plugin-sdk/testing';

const pluginRoot = fileURLToPath(new URL('./', import.meta.url));

test('local-path manifest loads a current plugin-local server without the demonstrated import escapes', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'tenet-server-boundary-'));
  try {
    // Prove that the public SDK boundary scanner catches the five live reload errors.
    const forbidden = {
      'server.ts': "import { emptyOverview } from '../src/inspector/bb-summary.js';",
      'contract.ts': "import { evaluatorFailureCodes } from '../src/inspector/finding-view.js';",
      'overview-contract.ts': "import { findingCategories } from '../src/decision/finding-triage.js';\n"
        + "import { evaluatorFailureCodes } from '../src/inspector/finding-view.js';\n"
        + "import { summaryChoices, summaryGates } from '../src/inspector/bb-summary.js';",
    };
    for (const [file, source] of Object.entries(forbidden)) await writeFile(join(fixture, file), source);
    await writeFile(join(fixture, 'package.json'), '{"type":"module"}');
    const sourceScan = experimental_scanPublicSdkOnly(fixture);
    assert.equal(sourceScan.violations.filter(v => v.reason === 'outside-package').length, 5);
    assert.deepEqual(new Set(sourceScan.violations.filter(v => v.reason === 'outside-package').map(v => v.specifier)),
      new Set(['../src/inspector/finding-view.js', '../src/decision/finding-triage.js', '../src/inspector/bb-summary.js']));
    for (const file of ['server.ts', 'contract.ts', 'overview-contract.ts']) await rm(join(fixture, file));

    // Execute the real prebuild command. A mock reload cannot detect this failure.
    const manifest = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'));
    assert.ok(manifest.scripts.build.includes('bun run build:server && bb plugin build .'));
    const build = spawnSync('bun', ['run', 'build:server'], { cwd: pluginRoot, encoding: 'utf8' });
    assert.equal(build.status, 0, build.error?.message ?? build.stderr);
    assert.equal(manifest.bb.server, './.server-workspace/server.js');
    const entry = new URL(manifest.bb.server, new URL('./', import.meta.url));
    await copyFile(entry, join(fixture, 'server.js'));
    const builtScan = experimental_scanPublicSdkOnly(fixture);
    assert.deepEqual(builtScan.violations, []);
    assert.deepEqual(builtScan.privateDependencies, []);

    // Execute the generated entry through the public host harness. This is not live activation.
    await symlink(join(pluginRoot, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    const { default: plugin } = await import(pathToFileURL(join(fixture, 'server.js')).href);
    const hostId = 'host_packaging', directory = '/fixture/private-recordings';
    const settings = { recordingDirectories: JSON.stringify({ [hostId]: directory }) };
    let hostReads = 0;
    let fake = createFakePluginHost({ pluginId: 'tenet-status', settings,
      sdk: {
        threads: { get: async () => ({ providerId: 'pi', environmentId: 'env_fixture' }) as any },
        environments: { get: async () => ({ id: 'env_fixture', hostId }) as any },
      },
      experimental_callHostRpc: async ({ input, hostId: selected }: any) => {
        hostReads++;
        assert.equal(selected, hostId);
        assert.equal(input.recordingDirectory, directory);
        return { coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: ['fixture-archive-unavailable'] };
      },
    });
    try {
      await plugin(fake.bb);
      const request = { threadId: 'thr_abcdefgh1234' };
      const before = await fake.harness.behavior.callRpc('status', request);
      assert.deepEqual(before, { coverage: 'unavailable', linkedCalls: 0, failures: 0, issues: ['fixture-archive-unavailable'] });
      fake = await fake.harness.lifecycle.reload(plugin);
      assert.deepEqual(await fake.harness.behavior.callRpc('status', request), before);
      assert.equal(hostReads, 2);
      assert.ok(!JSON.stringify(before).includes(directory));
    } finally { await fake.harness.lifecycle.dispose(); }
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
