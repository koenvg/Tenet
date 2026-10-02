import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertDelivery } from './delivery-contract.js';

export async function verifyArchive(archive: string): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-relocated-')));
  const home = join(root, 'home'); await mkdir(home);
  // Deliberately do not inherit TENET_*, API keys, NODE_PATH, Pi settings or npm config.
  const env = { PATH: process.env.PATH!, HOME: home, CI: '1', PI_CODING_AGENT_DIR: join(home, 'pi'),
    npm_config_userconfig: join(home, '.npmrc'), npm_config_globalconfig: join(home, '.npm-globalrc') };
  const run = (file: string, args: string[], cwd: string, overrides: Record<string, string> = {}) => execFileSync(file, args, { cwd, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 180_000 });
  try {
    // Reject links and path traversal before extraction, including contaminated tar fixtures.
    for (const name of run('tar', ['-tzf', resolve(archive)], root).trim().split('\n'))
      assert.ok(name === 'tenet/' || (name.startsWith('tenet/') && !name.split('/').some(p => p === '..' || p === '.')), `unsafe archive path: ${name}`);
    for (const entry of run('tar', ['-tvzf', resolve(archive)], root).trim().split('\n'))
      assert.ok(entry.startsWith('-') || entry.startsWith('d'), 'archive contains a link or special file');
    run('tar', ['-xzf', resolve(archive), '-C', root], root);
    const installation = join(root, 'tenet');
    await assertDelivery(installation);
    run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], installation);
    const requireInstalled = createRequire(join(installation, 'package.json'));
    for (const name of ['@earendil-works/pi-coding-agent', 'typescript', 'vite', 'svelte', 'playwright'])
      assert.throws(() => requireInstalled.resolve(name), `production installation must not contain ${name}`);
    const consumer = join(root, 'consumer'); await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'isolated-consumer', private: true, type: 'module',
      dependencies: { tenet: `file:${installation}` } }));
    run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
    await cp(new URL('./fixtures/archive-consumer.mjs', import.meta.url), join(consumer, 'check.mjs'));
    for (const runtime of ['node', 'bun']) console.log(run(runtime, ['check.mjs'], consumer).trim());

    // Test tools are installed separately, after the production-only imports and HTTP checks.
    const host = join(root, 'host'); await mkdir(host);
    const source = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    await writeFile(join(host, 'package.json'), JSON.stringify({ name: 'isolated-pi-host', private: true, type: 'module',
      dependencies: { tenet: `file:${installation}`, '@earendil-works/pi-coding-agent': source.peerDependencies['@earendil-works/pi-coding-agent'],
        '@earendil-works/pi-ai': source.devDependencies['@earendil-works/pi-ai'], typebox: source.devDependencies.typebox,
        typescript: source.devDependencies.typescript, '@types/node': source.devDependencies['@types/node'] } }));
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], host);
    await cp(new URL('./fixtures/archive-types.ts', import.meta.url), join(consumer, 'check.ts'));
    const trace = run('node', [join(host, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext', '--target', 'ES2023', '--typeRoots', join(host, 'node_modules/@types'), '--traceResolution', 'check.ts'], consumer);
    assert.ok(trace.includes(join(installation, 'dist/sdk/index.d.ts')), 'consumer must resolve delivered declarations');
    console.log('Isolated TypeScript declarations resolved.');
    await cp(new URL('./fixtures/archive-pi.mjs', import.meta.url), join(host, 'check.mjs'));
    for (const runtime of ['node', 'bun']) console.log(run(runtime, ['check.mjs', installation], host).trim());

    // Exercise the guide's registration/removal against a temporary agent directory only.
    const pi = join(host, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
    run('node', [pi, 'install', installation], root);
    await cp(new URL('./fixtures/archive-discovery.mjs', import.meta.url), join(host, 'discovery.mjs'));
    for (const runtime of ['node', 'bun']) console.log(run(runtime, ['discovery.mjs', '1'], host).trim());
    assert.ok(run('node', [pi, 'list'], root).includes(installation));
    // Follow the owner recipe only after registration. Each launch below is a new process.
    const project = join(root, 'owner-project'); await mkdir(project);
    const ownerEnv = { PATH: `${join(host, 'node_modules/.bin')}:${env.PATH}`, TYPESAFE_API_KEY: 'offline-owner-credential' };
    const doctorArgs = [join(installation, 'dist/cli/index.js'), 'doctor', '--project', project];
    const dormant = JSON.parse(run('node', [...doctorArgs, '--json'], root, ownerEnv));
    assert.equal(dormant.state, 'dormant'); assert.equal(dormant.compatibility.status, 'tested');
    await writeFile(join(project, 'TENET.md'), 'Rule; BLOCK; Ask before overwriting owner-demo.txt.\n');
    for (const runtime of ['node', 'bun']) {
      const diagnosis = JSON.parse(run(runtime, [...doctorArgs, '--json'], root, ownerEnv));
      assert.equal(diagnosis.state, 'ready'); assert.equal(diagnosis.mode, 'observe');
      assert.equal(diagnosis.capture.state, 'local-archive'); assert.equal(diagnosis.policy.ruleCount, 1);
      assert.equal(diagnosis.hooks, 'unverified'); assert.equal(diagnosis.provider, 'unverified');
      assert.equal(diagnosis.assessment, 'not-requested');
      assert.match(run(runtime, doctorArgs, root, ownerEnv), /TENET doctor: ready/);
    }
    await cp(new URL('./fixtures/archive-owner.mjs', import.meta.url), join(host, 'owner.mjs'));
    for (const runtime of ['node', 'bun']) {
      console.log(run(runtime, ['owner.mjs', installation, project, 'observe'], host, ownerEnv).trim());
      console.log(run(runtime, ['owner.mjs', installation, project, 'enforce'], host, { ...ownerEnv, TENET_MODE: 'enforce' }).trim());
    }
    // Removing the extension must leave the owner's policy and historical evidence intact.
    const recordings = join(home, '.tenet/recordings');
    const retained = await readdir(recordings);
    assert.ok(retained.length > 0, 'default recording retains the offline owner findings');
    for (const runtime of ['node', 'bun']) {
      console.log(run(runtime, ['owner.mjs', installation, project, 'observe'], host,
        { ...ownerEnv, TENET_RECORDING: 'off' }).trim());
      assert.deepEqual(await readdir(recordings), retained, 'capture opt-out preserves findings without new archive sessions');
    }
    run('node', [pi, 'remove', installation], root);
    assert.ok(!run('node', [pi, 'list'], root).includes(installation));
    for (const runtime of ['node', 'bun']) console.log(run(runtime, ['discovery.mjs', '0'], host).trim());
    assert.deepEqual(await readdir(recordings), retained);
    assert.equal(await readFile(join(project, 'TENET.md'), 'utf8'), 'Rule; BLOCK; Ask before overwriting owner-demo.txt.\n');
    console.log('Isolated Pi registration and removal passed; owner settings untouched.');
  } finally { await rm(root, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: bun scripts/verify-delivery.ts archive.tar.gz');
  await verifyArchive(process.argv[2]);
}
