import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ConsumerContext } from './delivery-consumers.js';
import { isolatedEnvironment, isolatedArgs } from './isolated-environment.js';

export async function verifyOwnerInstallation({ root, installation, consumer }: ConsumerContext): Promise<void> {
  const home = join(root, 'home-owner');
  const env = await isolatedEnvironment(root, home);
  const run = (file: string, args: string[], cwd: string, overrides: Record<string, string> = {}) => {
    assert.ok(!overrides.HOME, 'use a validated fixture environment for each owner home');
    return execFileSync(file, isolatedArgs(file, args), { cwd, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 180_000 });
  };
  const host = join(root, 'host');
  const modules = join(host, 'node_modules');
  await mkdir(join(modules, '.bin'), { recursive: true });
  for (const name of ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', 'typebox']) {
    await mkdir(dirname(join(modules, name)), { recursive: true });
    await symlink(join(installation, 'node_modules', name), join(modules, name), 'dir');
  }
  await symlink(installation, join(modules, 'tenet'), 'dir');
  await symlink(join(modules, '@earendil-works/pi-coding-agent/dist/cli.js'), join(modules, '.bin/pi'));
  await writeFile(join(installation, 'TENET.md'), 'Rule; Installation decoy must never be selected.\n');
  for (const runtime of ['node', 'bun']) {
    for (const scenario of ['none', 'project-only', 'global-only', 'combined', 'relative-override', 'absolute-override',
      'empty-global', 'malformed-global', 'broken-global', 'missing-project', 'empty-override']) {
      const caseRoot = join(consumer, `${runtime}-${scenario}`); await mkdir(caseRoot);
      const caseHome = join(caseRoot, 'home');
      const caseEnv = await isolatedEnvironment(root, caseHome);
      caseEnv.PATH = `${join(host, 'node_modules/.bin')}:${env.PATH}`;
      const project = join(caseRoot, 'session'); await mkdir(project);
      await cp(new URL('./fixtures/archive-policy.mjs', import.meta.url), join(project, 'check.mjs'));
      console.log(execFileSync(runtime, isolatedArgs(runtime, ['check.mjs', installation, project, scenario, caseHome]),
        { cwd: project, env: caseEnv, encoding: 'utf8', timeout: 180_000 }).trim());
    }
  }
  await rm(join(installation, 'TENET.md'));
  for (const name of ['archive-native.mjs', 'archive-offline-trap.mjs'])
    await cp(new URL(`./fixtures/${name}`, import.meta.url), join(host, name));
  await cp(new URL('./fixtures/archive-pi.mjs', import.meta.url), join(host, 'check.mjs'));
  for (const runtime of ['node', 'bun']) console.log(run(runtime, ['check.mjs', installation], host).trim());

  const pi = join(host, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
  run('node', [pi, 'install', installation], root);
  await cp(new URL('./fixtures/archive-discovery.mjs', import.meta.url), join(host, 'discovery.mjs'));
  for (const runtime of ['node', 'bun']) console.log(run(runtime, ['discovery.mjs', '1'], host).trim());
  assert.ok(run('node', [pi, 'list'], root).includes(installation));
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
  const expectedDoctor = (runtime: string, expectedExit: number) => {
    let output: string;
    try {
      output = run(runtime, ['--import', join(host, 'archive-offline-trap.mjs'), ...doctorArgs, '--json'], root, { PATH: ownerEnv.PATH });
      assert.equal(expectedExit, 0, 'doctor must reject invalid/incomplete setup');
    } catch (error) {
      const failed = error as { status?: number; stdout?: string; stderr?: string };
      assert.equal(failed.status, expectedExit); assert.equal(failed.stderr, '');
      assert.equal(typeof failed.stdout, 'string'); output = failed.stdout!;
    }
    return JSON.parse(output);
  };
  const judgeGuide = await readFile(join(installation, 'docs/judge.md'), 'utf8');
  const examples = [...judgeGuide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]!));
  const apus = examples.find(value => value.judge?.protocol === 'apus-llamacpp');
  assert.ok(apus); assert.equal(examples.length, 4);
  const settingsDirectory = join(home, '.tenet');
  await mkdir(settingsDirectory, { recursive: true, mode: 0o700 });
  const settingsFile = join(settingsDirectory, 'config.json');
  await writeFile(settingsFile, JSON.stringify(apus), { mode: 0o600 });
  const trap = join(host, 'archive-offline-trap.mjs');
  for (const runtime of ['node', 'bun']) {
    const diagnosis = JSON.parse(run(runtime, ['--import', trap, ...doctorArgs, '--json'], root, { PATH: ownerEnv.PATH }));
    assert.equal(diagnosis.state, 'ready'); assert.equal(diagnosis.delivery.status, 'complete');
    assert.equal(diagnosis.judge.provider, 'apus-llamacpp'); assert.equal(diagnosis.judge.requestedModel, apus.judge.model);
    assert.equal(diagnosis.judge.experimental, true); assert.equal(diagnosis.judge.connectivity, 'unverified');
    assert.equal(diagnosis.settings.deadlineMs, apus.decision.deadlineMs);
    assert.deepEqual(diagnosis.settings.observation, apus.observation);
    assert.equal(diagnosis.provider, 'unverified'); assert.equal(diagnosis.assessment, 'not-requested');
    assert.match(run(runtime, ['--import', trap, ...doctorArgs], root, { PATH: ownerEnv.PATH }), /Judge: apus-llamacpp/);
    for (const mode of ['observe', 'enforce'])
      console.log(run(runtime, ['owner.mjs', installation, project, mode, 'apus-llamacpp'], host,
        { PATH: ownerEnv.PATH, TENET_MODE: mode, TENET_RECORDING: 'off' }).trim());
  }
  const notice = join(installation, 'third-party/apus/NOTICE');
  const noticeBytes = await readFile(notice); await rm(notice);
  try {
    const incomplete = expectedDoctor('node', 1);
    assert.equal(incomplete.delivery.status, 'incomplete');
    assert.ok(incomplete.delivery.missing.includes('third-party/apus/NOTICE'));
  } finally { await writeFile(notice, noticeBytes); }
  await writeFile(settingsFile, JSON.stringify({ ...apus, forbidden: 'private-settings-canary' }), { mode: 0o600 });
  for (const runtime of ['node', 'bun']) {
    const invalid = expectedDoctor(runtime, 1);
    assert.equal(invalid.state, 'invalid'); assert.equal(invalid.judge.provider, 'unknown');
    assert.equal(invalid.judge.reason, 'configuration');
    assert.ok(!JSON.stringify(invalid).includes('private-settings-canary'));
  }
  await rm(settingsFile);
  await mkdir(join(home, '.tenet'), { recursive: true, mode: 0o700 });
  const globalPolicy = join(home, '.tenet/TENET.md');
  await writeFile(globalPolicy, 'Rule; BLOCK; Ask before overwriting owner-demo.txt.\n');
  await rm(join(project, 'TENET.md'));
  for (const roles of ['global', 'global,project']) {
    if (roles.includes('project')) await writeFile(join(project, 'TENET.md'), 'Rule; BLOCK; Ask before overwriting owner-demo.txt.\n');
    for (const provider of ['system-one', 'apus-llamacpp']) {
      if (provider === 'apus-llamacpp') await writeFile(settingsFile, JSON.stringify(apus), { mode: 0o600 });
      else await rm(settingsFile, { force: true });
      for (const runtime of ['node', 'bun']) for (const mode of ['observe', 'enforce'])
        console.log(run(runtime, ['owner.mjs', installation, project, mode, provider, roles], host,
          { ...(provider === 'system-one' ? ownerEnv : { PATH: ownerEnv.PATH, TENET_RECORDING: 'off' }), TENET_MODE: mode }).trim());
    }
    await rm(settingsFile, { force: true });
  }
  await rm(globalPolicy);
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
}
