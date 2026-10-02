import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { diagnoseProject, formatDoctor, DELIVERY_FILES } from '../src/doctor/doctor.js';

const canary = 'doctor-secret-canary-93812';
const policyText = `Private policy content 71239\nRule; Never publish ${canary}.\n`;
async function fixture(work: (f: { root: string; project: string; delivery: string; env: Record<string, string> }) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-doctor-')));
  const project = join(root, 'project'), delivery = join(root, 'delivery');
  const home = join(root, 'home');
  try {
    await mkdir(project); await mkdir(home, { mode: 0o700 });
    for (const file of DELIVERY_FILES) {
      await mkdir(join(delivery, file, '..'), { recursive: true });
      await writeFile(join(delivery, file), 'fixture');
    }
    await writeFile(join(delivery, 'package.json'), JSON.stringify({ name: 'tenet', type: 'module', dependencies: { '@typesafe-ai/sdk': '0.6.0' } }));
    const sdk = join(delivery, 'node_modules/@typesafe-ai/sdk');
    await mkdir(join(sdk, 'dist'), { recursive: true });
    await writeFile(join(sdk, 'package.json'), JSON.stringify({ name: '@typesafe-ai/sdk', version: '0.6.0' }));
    await writeFile(join(sdk, 'dist/index.mjs'), 'fixture');
    await writeFile(join(project, 'TENET.md'), policyText);
    await work({ root, project, delivery, env: { HOME: home, PATH: '', TYPESAFE_API_KEY: canary,
      TENET_CONTROL_PATH: join(home, '.tenet/control.json'), TENET_RECORDING_DIR: join(home, '.tenet/recordings') } });
  } finally { await chmod(project, 0o755).catch(() => {}); await rm(root, { recursive: true, force: true }); }
}

test('doctor reports policy identity, local readiness and honest verification limits without secret text', async () => fixture(async f => {
  const report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'ready'); assert.equal(report.exitCode, 0);
  assert.equal(report.policy.selection, 'local'); assert.equal(report.policy.validation, 'valid');
  assert.equal(report.policy.source, join(f.project, 'TENET.md'));
  assert.match(report.policy.digest!, /^[a-f0-9]{64}$/); assert.equal(report.policy.ruleCount, 1);
  assert.equal(report.mode, 'observe'); assert.equal(report.control, 'on');
  assert.deepEqual(report.credentials, { presence: 'present', validity: 'unverified' });
  assert.equal(report.capture.state, 'local-archive'); assert.equal(report.capture.writability, 'unverified');
  assert.equal(report.compatibility.status, 'unknown'); assert.equal(report.hooks, 'unverified');
  assert.equal(report.provider, 'unverified'); assert.equal(report.assessment, 'not-requested');
  for (const output of [JSON.stringify(report), formatDoctor(report)]) {
    assert.ok(!output.includes(canary)); assert.ok(!output.includes('Private policy content'));
    assert.ok(!output.includes('Never publish')); assert.ok(!output.includes('ALLOW'));
  }
}));

test('doctor distinguishes off and dormant and keeps missing credentials as a limitation', async () => fixture(async f => {
  delete f.env.TYPESAFE_API_KEY;
  let report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'unavailable'); assert.equal(report.exitCode, 1);
  await rm(join(f.project, 'TENET.md'));
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'dormant'); assert.equal(report.exitCode, 0);
  assert.equal(report.policy.validation, 'absent'); assert.equal(report.assessment, 'not-requested');
  assert.ok(report.limitations.some(i => i.code === 'missing-credentials'));
  await mkdir(join(f.env.HOME!, '.tenet'), { mode: 0o700 });
  await writeFile(f.env.TENET_CONTROL_PATH!, '{"version":1,"activation":"off"}', { mode: 0o600 });
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'off'); assert.equal(report.exitCode, 0);
  await writeFile(join(f.project, 'TENET.md'), policyText);
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'off'); assert.equal(report.policy.validation, 'valid');
}));

test('doctor uses explicit policy selection and bounded validation reasons', async () => fixture(async f => {
  f.env.TENET_POLICY = 'chosen.md';
  let report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'invalid'); assert.equal(report.policy.selection, 'explicit');
  assert.equal(report.policy.reason, 'policy-unavailable');
  await writeFile(join(f.project, 'chosen.md'), 'Rule;\n');
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.policy.reason, 'policy-format'); assert.equal(report.exitCode, 1);
  await writeFile(join(f.project, 'chosen.md'), 'Rule; WARN; evidenceThreshold=0.9; Keep secrets local.');
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'ready'); assert.equal(report.policy.ruleCount, 1);
}));

for (const [key, value] of Object.entries({ TENET_MODE: canary, TENET_EFFECT_THRESHOLD: '2', TENET_RECENT_EVENTS: '-1',
  TENET_SENSITIVE_FIELDS: `["${canary}",`, TENET_POLICY: '', TENET_CONTROL_PATH: 'relative',
  TENET_RECORDING: canary, TENET_RECORDING_DIR: 'relative' })) {
  test(`doctor rejects invalid ${key} without reflecting its value`, async () => fixture(async f => {
    f.env[key] = value;
    const report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
    assert.equal(report.state, 'invalid'); assert.equal(report.exitCode, 1);
    assert.ok(!JSON.stringify(report).includes(canary)); assert.ok(!formatDoctor(report).includes(canary));
  }));
}

test('doctor reports capture opt-out, unsafe controls, missing project and incomplete delivery', async () => fixture(async f => {
  f.env.TENET_RECORDING = 'off';
  let report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.capture.state, 'disabled'); assert.equal(report.state, 'ready');
  await mkdir(join(f.env.HOME!, '.tenet'), { mode: 0o700 });
  await writeFile(f.env.TENET_CONTROL_PATH!, '{bad', { mode: 0o600 });
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.control, 'unavailable'); assert.equal(report.state, 'invalid');
  await rm(f.env.TENET_CONTROL_PATH!);
  await symlink(join(f.project, 'TENET.md'), f.env.TENET_CONTROL_PATH!);
  assert.equal((await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env })).control, 'unavailable');
  await rm(f.env.TENET_CONTROL_PATH!);
  await rm(join(f.delivery, 'dist/sdk/index.js'));
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'unavailable'); assert.equal(report.exitCode, 1);
  assert.ok(report.delivery.missing.includes('dist/sdk/index.js'));
  report = await diagnoseProject({ projectDir: join(f.root, 'missing'), deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'invalid');
}));

test('doctor reads Pi metadata without executing it and distinguishes tested, untested and unknown versions', async () => fixture(async f => {
  const host = join(f.project, 'node_modules/@earendil-works/pi-coding-agent');
  await mkdir(host, { recursive: true });
  for (const [version, status, exit] of [['0.85.1', 'tested', 0], ['0.86.0', 'unavailable', 1], ['0.86.0+build.1', 'unavailable', 1], ['0.85.1+build.1', 'unavailable', 1], ['0.86.0-alpha.1+build.1', 'unavailable', 1], ['0.86.0-01', 'unknown', 0], ['01.86.0', 'unknown', 0], [canary, 'unknown', 0]] as const) {
    await writeFile(join(host, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version }));
    const report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
    assert.equal(report.compatibility.status, status); assert.equal(report.exitCode, exit);
    assert.ok(!JSON.stringify(report).includes(canary));
  }
  await writeFile(join(host, 'package.json'), '{');
  assert.equal((await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env })).compatibility.status, 'unknown');
}));

test('doctor redacts semver-shaped credentials and credential substrings in compatibility metadata', async () => fixture(async f => {
  const host = join(f.project, 'node_modules/@earendil-works/pi-coding-agent');
  await mkdir(host, { recursive: true });
  for (const key of [`0.86.0-${canary}`, canary]) {
    f.env.TYPESAFE_API_KEY = key;
    await writeFile(join(host, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: `0.86.0-${canary}` }));
    const report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
    assert.equal(report.compatibility.status, 'unavailable'); assert.equal(report.exitCode, 1);
    for (const output of [JSON.stringify(report), formatDoctor(report)]) assert.ok(!output.includes(key));
  }
  const identity = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  f.env.TYPESAFE_API_KEY = identity.policy.digest!;
  const redacted = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  for (const output of [JSON.stringify(redacted), formatDoctor(redacted)]) assert.ok(!output.includes(f.env.TYPESAFE_API_KEY));
}));

test('doctor skips non-executable PATH candidates and selects the first executable Pi', async () => fixture(async f => {
  const bins: string[] = [];
  for (const [name, version, mode] of [['first', '0.85.1', 0o644], ['second', '0.86.0', 0o755]] as const) {
    const host = join(f.root, name), bin = join(host, 'bin');
    await mkdir(bin, { recursive: true }); bins.push(bin);
    await writeFile(join(host, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version }));
    await writeFile(join(bin, 'pi'), 'throw new Error("must never execute");', { mode });
  }
  f.env.PATH = bins.join(':');
  let report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.compatibility.version, '0.86.0'); assert.equal(report.exitCode, 1);
  await chmod(join(bins[0]!, 'pi'), 0o755);
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.compatibility.version, '0.85.1'); assert.equal(report.exitCode, 0);
}));

test('doctor detects PATH host metadata without executing a launcher', async () => fixture(async f => {
  const bin = join(f.root, 'bin'), host = join(f.root, 'host');
  await mkdir(bin); await mkdir(join(host, 'dist'), { recursive: true });
  await writeFile(join(host, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '0.99.0' }));
  await writeFile(join(host, 'dist/cli.js'), 'throw new Error("must never execute");', { mode: 0o755 });
  await symlink(join(host, 'dist/cli.js'), join(bin, 'pi'));
  f.env.PATH = bin;
  let report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.compatibility.source, 'path'); assert.equal(report.compatibility.status, 'unavailable');
  assert.equal(report.exitCode, 1); assert.ok(report.issues.some(i => i.guidance.includes('0.85.1')));
  await rm(join(bin, 'pi')); await writeFile(join(bin, 'pi'), 'unknown launcher', { mode: 0o755 });
  report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.compatibility.status, 'unknown'); assert.equal(report.compatibility.version, null);
}));

test('doctor reports absent runtime dependencies and invalid setup even when dormant', async () => fixture(async f => {
  await rm(join(f.delivery, 'node_modules'), { recursive: true });
  let report = await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env });
  assert.equal(report.state, 'unavailable'); assert.ok(report.delivery.missing.includes('installed-typesafe-runtime'));
  await rm(join(f.project, 'TENET.md'));
  assert.equal((await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env })).exitCode, 1);
  f.env.TENET_MODE = 'broken';
  assert.equal((await diagnoseProject({ projectDir: f.project, deliveryDir: f.delivery, env: f.env })).state, 'invalid');
}));

async function snapshot(root: string): Promise<unknown[]> {
  const result: unknown[] = [];
  for (const name of (await readdir(root)).sort()) {
    const path = join(root, name), stat = await lstat(path);
    result.push([path, stat.mode, stat.size, stat.mtimeMs, stat.isDirectory() ? await snapshot(path) : await readFile(path, 'hex')]);
  }
  return result;
}

test('relocated compiled doctor runs under Node and Bun with traps, no writes and no disclosure', async () => fixture(async f => {
  await cp(resolve('dist'), join(f.delivery, 'dist'), { recursive: true });
  const trap = join(f.root, 'trap.mjs');
  await writeFile(trap, `import fs from 'node:fs'; import fsp from 'node:fs/promises';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls';
import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
let attempts = 0; const fail = () => { attempts++; throw new Error('doctor-side-effect-trap'); };
process.once('beforeExit', () => { if (attempts) process.exitCode = 99; });
globalThis.setInterval = fail;
globalThis.fetch = fail;
for (const module of [http, https]) { module.request = fail; module.get = fail; }
net.connect = fail; net.createConnection = fail; net.Socket.prototype.connect = fail; tls.connect = fail;
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[key] = fail;
for (const key of ['watch', 'watchFile', 'writeFile', 'writeFileSync', 'mkdir', 'mkdirSync', 'rename', 'renameSync', 'unlink', 'unlinkSync', 'rm', 'rmSync', 'createWriteStream', 'chmod', 'chmodSync']) fs[key] = fail;
for (const key of ['writeFile', 'mkdir', 'rename', 'unlink', 'rm', 'chmod']) fsp[key] = fail;
const originalOpen = fsp.open; fsp.open = (p, flags, ...args) => { if (typeof flags !== 'number' || (flags & 3) !== 0) fail(); return originalOpen(p, flags, ...args); };
const originalOpenSync = fs.openSync; fs.openSync = (p, flags, ...args) => { if (flags !== 'r' && flags !== 'rs' && (typeof flags !== 'number' || (flags & 3) !== 0)) fail(); return originalOpenSync(p, flags, ...args); };
syncBuiltinESMExports();`);
  const runtimes = [spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' }).stdout.trim(), process.execPath];
  const check = async (state: string, exitCode: number) => {
    await chmod(f.project, 0o555);
    try {
      const before = await snapshot(f.root);
      for (const runtime of runtimes) {
        for (const json of [true, false]) {
          const child = spawnSync(runtime, ['--import', trap, join(f.delivery, 'dist/cli/index.js'), 'doctor', '--project', f.project, ...(json ? ['--json'] : [])],
            { env: f.env, cwd: f.root, encoding: 'utf8', timeout: 10000 });
          assert.equal(child.status, exitCode, child.stderr || child.stdout);
          assert.ok(!child.stdout.includes(canary)); assert.ok(!child.stdout.includes('Private policy content'));
          assert.ok(!child.stdout.includes('Never publish')); assert.equal(child.stderr, '');
          if (json) assert.equal(JSON.parse(child.stdout).state, state);
          else assert.ok(child.stdout.startsWith(`TENET doctor: ${state}`));
        }
      }
      assert.deepEqual(await snapshot(f.root), before);
    } finally { await chmod(f.project, 0o755); }
  };
  await check('ready', 0);
  const hostVersion = `0.86.0-${canary}`;
  await writeFile(join(f.root, 'pi'), 'throw new Error("must never execute");', { mode: 0o755 });
  await writeFile(join(f.root, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: hostVersion }));
  f.env.PATH = ':';
  await check('unavailable', 1);
  f.env.TYPESAFE_API_KEY = hostVersion;
  f.env.PATH = '';
  await check('unavailable', 1);
  await writeFile(join(f.root, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '0.86.0+build.1' }));
  await check('unavailable', 1);
  f.env.TYPESAFE_API_KEY = canary;
  await rm(join(f.root, 'pi')); await rm(join(f.root, 'package.json'));
  delete f.env.TYPESAFE_API_KEY;
  await check('unavailable', 1);
  await mkdir(join(f.env.HOME!, '.tenet'), { mode: 0o700 });
  await writeFile(f.env.TENET_CONTROL_PATH!, '{"version":1,"activation":"off"}', { mode: 0o600 });
  await check('off', 0);
  await rm(join(f.project, 'TENET.md')); await rm(f.env.TENET_CONTROL_PATH!);
  await check('dormant', 0);
  f.env.TENET_POLICY = 'missing.md';
  await check('invalid', 1);
  await writeFile(join(f.project, 'missing.md'), `Rule;\n${canary}`);
  await check('invalid', 1);
  delete f.env.TENET_POLICY;
  f.env.TENET_MODE = canary;
  await check('invalid', 1);
  delete f.env.TENET_MODE;
  await rm(join(f.delivery, 'inspector/dist/index.html'));
  await check('unavailable', 1);
}));
