import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedEnvironment } from '../scripts/isolated-environment.js';

const repository = fileURLToPath(new URL('..', import.meta.url));

type FixtureDescendant = { pid: number; group: number };
type DescendantEvidence = (root: string) => Promise<FixtureDescendant[]>;

async function cleanupFixture(root: string, evidence: DescendantEvidence, pollMs = 5,
  kill: typeof process.kill = process.kill.bind(process)) {
  try {
    const descendants = await evidence(root);
    for (const server of descendants) {
      assert.ok(Number.isSafeInteger(server.pid) && server.pid > 0 && Number.isSafeInteger(server.group) && server.group > 0,
        'fixture evidence identifies a positive descendant PID and process group');
    }
    let killError: unknown;
    for (const group of new Set(descendants.map(server => server.group))) {
      try { kill(-group, 'SIGKILL'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') killError ??= error;
        else if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    const remaining = () => descendants.filter(server => {
      try { return alive(server.pid, kill) || alive(-server.group, kill); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
        // An exiting group can transiently deny a probe. Keep state until absence is confirmed.
        killError ??= error;
        return true;
      }
    });
    for (let i = 0; i < 200 && remaining().length; i++) await sleep(pollMs);
    if (remaining().length && killError) throw killError;
    assert.deepEqual(remaining(), [], 'fixture descendants stopped before ancestor cleanup');
  } catch (error) {
    throw new Error(`retained fixture root ${root}, descendant evidence and .tenet-consumer-state markers`, { cause: error });
  }
  await rm(root, { recursive: true, force: true });
}

async function checkout(check: (root: string, checkout: string) => Promise<void>,
  evidence: DescendantEvidence = async () => []) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-consumer-test-')));
  const copy = join(root, 'checkout');
  try {
    await mkdir(copy);
    for (const path of ['scripts', 'src', 'web', 'inspector/src', 'inspector/index.html', 'inspector/vite.config.ts',
      'docs/judge.md', 'docs/doctor.md', 'third-party/apus', 'LICENSE', 'package.json', 'bun.lock',
      'tsconfig.json', 'tsconfig.sdk.json', 'tsconfig.delivery.json']) {
      await mkdir(dirname(join(copy, path)), { recursive: true });
      await cp(join(repository, path), join(copy, path), { recursive: true });
    }
    await symlink(join(repository, 'node_modules'), join(copy, 'node_modules'), 'dir');
    await check(root, copy);
  } finally { await cleanupFixture(root, evidence, 10); }
}

async function run(root: string, copy: string) {
  const bin = join(root, 'bin'); await mkdir(bin, { recursive: true });
  for (const name of ['npm', 'npx', 'bunx']) {
    const file = join(bin, name);
    await writeFile(file, `#!/bin/sh\necho forbidden-registry-command >> '${join(root, 'registry.log')}'\nexit 97\n`);
    await chmod(file, 0o700);
  }
  const env = await isolatedEnvironment(root, join(root, 'owner'));
  env.PATH = `${bin}:${env.PATH}`;
  Object.assign(env, { TYPESAFE_API_KEY: 'inherited-secret', OPENAI_API_KEY: 'inherited-secret',
    ANTHROPIC_API_KEY: 'inherited-secret', TENET_POLICY: 'inherited-policy', NODE_OPTIONS: '--no-warnings',
    NODE_PATH: '/inherited-node-path' });
  const result = spawnSync('bun', ['--no-env-file', 'run', 'delivery:check'], {
    cwd: copy, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal((await readdir(root)).includes('registry.log'), false, 'offline check must not invoke registry tools');
  return result;
}

async function instrument(root: string, copy: string) {
  for (const name of ['archive-consumer.mjs', 'archive-judge.mjs']) {
    const path = join(copy, 'scripts/fixtures', name);
    const original = await readFile(path, 'utf8');
    await writeFile(path, `
      import { homedir as processHome } from 'node:os';
      import { writeFileSync as saveEvidence } from 'node:fs';
      import { existsSync as hasVisited } from 'node:fs';
      assert.equal(processHome(), process.env.HOME);
      assert.ok(processHome().startsWith(process.env.TMPDIR + '/'));
      for (const key of ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TENET_POLICY', 'NODE_OPTIONS', 'NODE_PATH', 'DOTENV_CANARY'])
        assert.equal(process.env[key], undefined, key);
      assert.equal(hasVisited(processHome() + '/consumer-visited'), false, 'each consumer needs a fresh process home');
      saveEvidence(processHome() + '/consumer-visited', 'visited');
      saveEvidence(process.cwd() + '/.env', 'DOTENV_CANARY=consumer-dotenv\\nTYPESAFE_API_KEY=fixture-dotenv-secret\\n');
      saveEvidence(${JSON.stringify(join(root, name + '.json'))}, JSON.stringify({ root: process.env.TMPDIR, home: processHome() }));
    ` + original);
  }
}

async function assertCleaned(root: string) {
  const evidence = JSON.parse(await readFile(join(root, 'archive-consumer.mjs.json'), 'utf8'));
  assert.equal((await readdir(dirname(evidence.root))).includes(evidence.root.split('/').at(-1)), false,
    'runner must remove its temporary installation after children exit');
}

test('ordinary delivery check builds fresh consumers offline with isolated Node/Bun homes and Vite dotenv disabled', { timeout: 120_000 }, async () => {
  await checkout(async (root, copy) => {
    await instrument(root, copy);
    await writeFile(join(copy, '.env'), 'DOTENV_CANARY=checkout-dotenv\nTYPESAFE_API_KEY=dotenv-secret\n');
    await writeFile(join(copy, 'inspector/.env'), 'VITE_DELIVERY_CANARY=inspector-dotenv-secret\n');
    const main = join(copy, 'inspector/src/main.tsx');
    await writeFile(main, await readFile(main, 'utf8') + '\nconsole.log(import.meta.env.VITE_DELIVERY_CANARY);\n');
    const fixture = join(copy, 'scripts/fixtures/archive-consumer.mjs');
    await writeFile(fixture, (await readFile(fixture, 'utf8')).replace(
      'assert.equal((await fetchHTTP(new URL(path, url))).status, 200);',
      `{ const asset = await fetchHTTP(new URL(path, url)); assert.equal(asset.status, 200); assert.ok(!(await asset.text()).includes('inspector-dotenv-secret')); }`));
    const result = await run(root, copy);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    for (const text of ['Node SDK:', 'Bun SDK:', 'Node archive APUS:', 'Bun archive APUS:', 'Isolated TypeScript declarations resolved.'])
      assert.ok(result.stdout.includes(text), text);
    assert.equal((await readdir(copy)).includes('dist'), false, 'checkout output must not be built or copied');
    assert.equal((await readdir(join(copy, 'inspector'))).includes('dist'), false);
    await assertCleaned(root);
  });
});

for (const runtime of ['node', 'bun']) {
  for (const fixture of ['archive-consumer.mjs', 'archive-judge.mjs']) {
    test(`ordinary runner rejects a stale ${fixture} expectation under ${runtime}`, { timeout: 120_000 }, async () => {
      await checkout(async (root, copy) => {
        await instrument(root, copy);
        const path = join(copy, 'scripts/fixtures', fixture);
        const original = await readFile(path, 'utf8');
        const before = fixture === 'archive-consumer.mjs' ? "assert.equal(SDK_VERSION, 'alpha-1');"
          : 'assert.equal(diagnosis.settings.deadlineMs, 120000);';
        assert.ok(original.includes(before));
        const wrong = fixture === 'archive-consumer.mjs' ? "assert.equal(SDK_VERSION, 'stale-sdk-expectation');"
          : 'assert.equal(diagnosis.settings.deadlineMs, -138);';
        await writeFile(path, original.replace(before, `if (${runtime === 'bun' ? '!!' : '!'}process.versions.bun) ${wrong}`));
        const result = await run(root, copy);
        assert.equal(result.status, 1, result.stderr + result.stdout);
        assert.match(result.stderr, /AssertionError/);
        assert.match(result.stderr, fixture === 'archive-consumer.mjs' ? /stale-sdk-expectation/ : /-138/);
        await assertCleaned(root);
      });
    });
  }
}

test('ordinary runner rejects stale declarations with TS2322', { timeout: 120_000 }, async () => {
  await checkout(async (root, copy) => {
    await instrument(root, copy);
    const path = join(copy, 'scripts/fixtures/archive-types.ts');
    await writeFile(path, await readFile(path, 'utf8') + '\nconst stale: number = SDK_VERSION;\n');
    const result = await run(root, copy);
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stderr, /error TS2322: Type 'string' is not assignable to type 'number'/);
    assert.ok(!result.stdout.includes('Isolated TypeScript declarations resolved.'));
    await assertCleaned(root);
  });
});

for (const failure of ['assertion', 'timeout']) {
  test(`ordinary runner cleans up the live inspector after ${failure}`, { timeout: 120_000 }, async () => {
    await checkout(async (root, copy) => {
      await instrument(root, copy);
      if (failure === 'timeout') {
        const runner = join(copy, 'scripts/delivery-consumers.ts');
        const source = await readFile(runner, 'utf8');
        const timer = "setTimeout(() => { failure = 'timed out'; terminate(); }, 180_000)";
        assert.ok(source.includes(timer));
        await writeFile(runner, source.replace(timer, timer.replace('180_000', '8_000')));
      }
      const fixture = join(copy, 'scripts/fixtures/archive-consumer.mjs');
      const source = await readFile(fixture, 'utf8');
      const started = 'const htmlResponse = await fetchHTTP(url);';
      assert.ok(source.includes(started));
      await writeFile(fixture, source.replace(started,
        `saveEvidence(${JSON.stringify(join(root, 'inspector.json'))}, JSON.stringify({ url, pid: inspector.pid }));\n`
        + (failure === 'assertion' ? "assert.fail('deliberate-inspector-failure');\n" : 'await new Promise(resolve => setTimeout(resolve, 60_000));\n')
        + started));
      const result = await run(root, copy);
      assert.equal(result.status, 1, result.stderr + result.stdout);
      assert.match(result.stderr, failure === 'assertion' ? /deliberate-inspector-failure/ : /check.mjs timed out/);
      const server = JSON.parse(await readFile(join(root, 'inspector.json'), 'utf8'));
      await assert.rejects(fetch(server.url), /fetch|connect/i);
      await assertCleaned(root);
    });
  });
}

function alive(pid: number, kill: typeof process.kill = process.kill.bind(process)): boolean {
  try { kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

test('parent fixture cleanup confirms absence after a transient group kill EPERM', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-cleanup-test-')));
  const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  const done = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()); });
  const pid = child.pid;
  assert.ok(pid);
  const evidence: DescendantEvidence = async () => [{ pid, group: pid }];
  const kill = process.kill.bind(process);
  const transientKill: typeof process.kill = (pid, signal) => {
    const result = kill(pid, signal);
    if (signal === 'SIGKILL') throw Object.assign(new Error('transient group permission failure'), { code: 'EPERM' });
    return result;
  };
  try {
    await writeFile(join(root, '.tenet-consumer-state'), 'owned marker');
    await cleanupFixture(root, evidence, 5, transientKill);
    assert.equal(existsSync(root), false, 'confirmed disappearance permits removal despite a signal error');
  } finally {
    if (existsSync(root)) await cleanupFixture(root, evidence);
    await done;
  }
});

for (const target of ['pid', 'group'] as const) {
  test(`parent fixture cleanup waits for absence after transient ${target} probe EPERM`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-cleanup-test-')));
    const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
    const done = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()); });
    const pid = child.pid;
    assert.ok(pid);
    const evidence: DescendantEvidence = async () => [{ pid, group: pid }];
    const kill = process.kill.bind(process), absent = new Set<number>();
    let permissionFailures = 0;
    const transientProbe: typeof process.kill = (candidate, signal) => {
      if (signal === 0 && candidate === (target === 'pid' ? pid : -pid) && permissionFailures < 2) {
        permissionFailures++;
        assert.equal(existsSync(join(root, '.tenet-consumer-state')), true, 'uncertain liveness retains state');
        throw Object.assign(new Error('transient exit-time probe failure'), { code: 'EPERM' });
      }
      try { return kill(candidate, signal); }
      catch (error) {
        if (signal === 0 && (error as NodeJS.ErrnoException).code === 'ESRCH') absent.add(candidate);
        throw error;
      }
    };
    try {
      await writeFile(join(root, '.tenet-consumer-state'), 'owned marker');
      await cleanupFixture(root, evidence, 5, transientProbe);
      assert.equal(permissionFailures, 2, 'cleanup retries the uncertain probe instead of removing state');
      assert.deepEqual([...absent].sort((a, b) => a - b), [-pid, pid], 'both PID and group must confirm absence');
      assert.equal(existsSync(root), false, 'only confirmed absence permits fixture removal');
    } finally {
      if (existsSync(root)) await cleanupFixture(root, evidence);
      await done;
    }
  });
}

for (const failure of ['kill-error', 'probe-error', 'still-alive'] as const) {
  test(`parent fixture cleanup retains root and marker after ${failure}`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-cleanup-test-')));
    const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
    const done = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()); });
    assert.ok(child.pid);
    const evidence = [{ pid: child.pid, group: child.pid }];
    const readEvidence: DescendantEvidence = async root => JSON.parse(await readFile(join(root, 'descendants.json'), 'utf8'));
    await writeFile(join(root, 'descendants.json'), JSON.stringify(evidence));
    await writeFile(join(root, '.tenet-consumer-state'), 'owned marker');
    const kill = process.kill.bind(process);
    const failingKill: typeof process.kill = (pid, signal) => {
      if ((failure === 'kill-error' && signal === 'SIGKILL') || (failure === 'probe-error' && signal === 0))
        throw Object.assign(new Error(`deliberate ${failure}`), { code: 'EPERM' });
      if (failure === 'still-alive' && signal === 0) return true;
      return kill(pid, signal);
    };
    try {
      await assert.rejects(cleanupFixture(root, readEvidence, 5, failingKill), error => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes(`retained fixture root ${root}`));
        assert.match(error.message, /\.tenet-consumer-state/);
        if (failure !== 'still-alive') assert.equal((error.cause as NodeJS.ErrnoException).code, 'EPERM');
        else assert.match(String(error.cause), /fixture descendants stopped before ancestor cleanup/);
        return true;
      });
      assert.equal(await readFile(join(root, '.tenet-consumer-state'), 'utf8'), 'owned marker');
      assert.deepEqual(await readEvidence(root), evidence);
      if (failure === 'kill-error') assert.equal(alive(child.pid), true);
    } finally {
      await cleanupFixture(root, readEvidence);
      await done;
    }
    assert.equal(existsSync(root), false, 'confirmed absence permits fixture removal');
  });
}

for (const failure of ['assertion', 'timeout'] as const) {
  test(`parent fixture cleanup stops descendants after subprocess ${failure}`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-cleanup-test-')));
    const readEvidence: DescendantEvidence = async root => JSON.parse(await readFile(join(root, 'descendants.json'), 'utf8'));
    try {
      const result = spawnSync('node', ['--input-type=module', '-e', `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const root = ${JSON.stringify(root)};
writeFileSync(root + '/.tenet-consumer-state', 'owned marker');
const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
child.once('spawn', () => {
  writeFileSync(root + '/descendants.json', JSON.stringify([{ pid: child.pid, group: child.pid }]));
  ${failure === 'assertion' ? "throw new Error('deliberate subprocess assertion');" : 'setInterval(() => {}, 1000);'}
});
`], { encoding: 'utf8', timeout: 1000 });
      if (failure === 'assertion') {
        assert.equal(result.status, 1);
        assert.match(result.stderr, /deliberate subprocess assertion/);
      } else assert.equal((result.error as NodeJS.ErrnoException).code, 'ETIMEDOUT');
      const evidence = await readEvidence(root);
      assert.equal(evidence.length, 1);
      for (const server of evidence) assert.equal(alive(server.pid), true);
      assert.equal(await readFile(join(root, '.tenet-consumer-state'), 'utf8'), 'owned marker');
    } finally { await cleanupFixture(root, readEvidence); }
    assert.equal(existsSync(root), false, 'parent stops the orphan before fixture removal');
  });
}

for (const entry of ['canonical', 'standalone'] as const) for (const signal of ['SIGINT', 'SIGTERM'] as const)
  for (const shutdown of ['immediate', 'delayed', 'blocked', 'denied'] as const) {
  const retained = shutdown === 'blocked' || shutdown === 'denied';
  test(`${entry} delivery stage ${retained ? 'retains state for a blocked' : 'stops the real'} SDK consumer and inspector before cleanup on ${signal}${shutdown === 'immediate' ? '' : ` (${shutdown})`}`, { timeout: 120_000 }, async () => {
    await checkout(async (root, copy) => {
      const realBun = spawnSync('which', ['bun'], { encoding: 'utf8' }).stdout.trim();
      const bin = join(root, 'bin'); await mkdir(bin);
      await mkdir(join(root, 'cache'));
      await mkdir(join(copy, 'bb-plugin-tenet-status'));
      const wrapper = join(bin, 'bun');
      await writeFile(wrapper, `#!/bin/bash
if [[ "$1" == --no-env-file ]]; then shift; fi
if [[ "$*" == 'run delivery:check' ]]; then exec ${JSON.stringify(realBun)} --no-env-file run delivery:check; fi
case "$*" in 'run sdk:build'|'run inspector:build'|'run summary:build'|'run site:build'|'../scripts/check-summary-build.ts'|'run build:server'|'run test'|'run typecheck') exit 0;; esac
if [[ "$1" == run ]]; then echo "Unexpected lane stage: $*" >&2; exit 98; fi
exec ${JSON.stringify(realBun)} --no-env-file "$@"
`);
      await chmod(wrapper, 0o700);
      const evidence = join(root, 'ready.json');
      const pendingEvidence = `${evidence}.pending`;
      if (shutdown !== 'immediate') {
        const runner = join(copy, 'scripts/delivery-consumers.ts');
        await writeFile(runner, `
const realKill = process.kill.bind(process);
const deferredGroups = new Set<number>();
process.kill = (pid, signal) => {
  if (pid >= 0 || signal !== 'SIGKILL') return realKill(pid, signal);
  ${shutdown === 'denied' ? "throw Object.assign(new Error('deliberate denied group kill'), { code: 'EPERM' });" : ''}
  try { realKill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  ${shutdown === 'blocked' ? "throw Object.assign(new Error('deliberate group kill failure'), { code: 'EPERM' });" : `
  if (!deferredGroups.has(pid)) {
    deferredGroups.add(pid);
    setTimeout(() => { try { realKill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }, 150);
  }
  return true;`}
};
` + await readFile(runner, 'utf8'));
      }
      const fixture = join(copy, 'scripts/fixtures/archive-consumer.mjs');
      const source = await readFile(fixture, 'utf8');
      const ready = 'const htmlResponse = await fetchHTTP(url);';
      assert.ok(source.includes(ready));
      await writeFile(fixture, source.replace(ready, `
await writeFile(${JSON.stringify(pendingEvidence)}, '');
await new Promise(resolve => setTimeout(resolve, 50));
await writeFile(${JSON.stringify(pendingEvidence)}, JSON.stringify({
  consumer: process.pid, inspector: inspector.pid, url,
  state: process.env.TMPDIR, lane: process.env.TMPDIR.slice(0, process.env.TMPDIR.lastIndexOf('/'))
}));
await (await import('node:fs/promises')).rename(${JSON.stringify(pendingEvidence)}, ${JSON.stringify(evidence)});
await new Promise(resolve => setTimeout(resolve, 60_000));
${ready}`));
      const env = await isolatedEnvironment(root, join(root, 'owner'));
      env.PATH = `${bin}:${env.PATH}`;
      const child = entry === 'canonical'
        ? spawn('/bin/bash', ['--noprofile', '--norc', 'scripts/validate-offline.sh', '--browser-cache', join(root, 'cache')], {
          cwd: copy, env, stdio: ['ignore', 'pipe', 'pipe'],
        })
        : spawn(realBun, ['--no-env-file', 'scripts/check-delivery-consumers.ts'], {
          cwd: copy, env, stdio: ['ignore', 'pipe', 'pipe'],
        });
      let stdout = '', stderr = '', finished = false;
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      const done = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => { finished = true; resolve(code); });
      });
      let server: { consumer: number; inspector: number; url: string; state: string; lane: string } | undefined;
      try {
        for (let i = 0; i < 6_000 && !finished && !existsSync(evidence); i++) await sleep(10);
        assert.ok(existsSync(evidence), `SDK fixture reached real inspector readiness.\n${stdout}\n${stderr}`);
        server = JSON.parse(await readFile(evidence, 'utf8'));
        assert.ok(server);
        assert.equal((await fetch(server.url)).status, 200);
        assert.ok(alive(server.consumer)); assert.ok(alive(server.inspector));
        assert.ok(existsSync(server.state)); assert.ok(existsSync(server.lane));
        child.kill(signal);
        const removedWhileAlive: string[] = [];
        for (let i = 0; i < 1_000 && !finished; i++) {
          for (const path of (entry === 'canonical' ? [server.state, server.lane] : [server.state]))
            if (!existsSync(path) && (alive(server.consumer) || alive(server.inspector))) removedWhileAlive.push(path);
          await sleep(5);
        }
        assert.ok(finished, `${entry} interruption completed within five seconds.\n${stderr}`);
        assert.equal(await done, signal === 'SIGINT' ? 130 : 143, stdout + stderr);
        const observed = { consumerAlive: alive(server.consumer), inspectorAlive: alive(server.inspector),
          stateExists: existsSync(server.state), laneExists: existsSync(server.lane) };
        console.log(`${signal} ${entry} ${shutdown} delivery interruption: ${JSON.stringify(observed)}`);
        assert.deepEqual(observed, { consumerAlive: shutdown === 'denied', inspectorAlive: retained,
          stateExists: retained, laneExists: retained || entry === 'standalone' });
        if (retained) assert.match(stderr, /retained temporary state/);
        assert.deepEqual(removedWhileAlive, [], 'temporary state must remain until both descendants stop');
        if (retained) assert.equal((await fetch(server.url)).status, 200);
        else await assert.rejects(fetch(server.url), /fetch|connect/i);
        assert.ok(existsSync(join(root, 'cache')), 'unowned browser cache remains');
      } finally {
        if (!finished) {
          child.kill('SIGTERM');
          for (let i = 0; i < 500 && !finished; i++) await sleep(10);
          if (!finished) child.kill('SIGKILL');
        }
        await done;
      }
    }, async root => {
      const server = JSON.parse(await readFile(join(root, 'ready.json'), 'utf8'));
      return [{ pid: server.consumer, group: server.consumer }, { pid: server.inspector, group: server.consumer }];
    });
  });
}

for (const outcome of ['success', 'marker', 'assertion', 'overflow', 'spawn', 'SIGINT', 'SIGTERM'] as const) {
  test(`shared consumer lifetime releases signal handlers after ${outcome}`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-lifetime-test-')));
    try {
      await mkdir(join(root, 'scripts/fixtures'), { recursive: true });
      await mkdir(join(root, 'consumer'));
      for (const name of ['delivery-consumers.ts', 'isolated-environment.ts'])
        await cp(join(repository, 'scripts', name), join(root, 'scripts', name));
      const interrupted = outcome === 'SIGINT' || outcome === 'SIGTERM';
      const source = outcome === 'assertion' ? "throw new Error('lifetime-assertion');"
        : outcome === 'overflow' ? "process.stdout.write('x'.repeat(1_000_001)); setInterval(() => {}, 1000);"
        : (interrupted || outcome === 'marker') ? `import {writeFileSync} from 'node:fs';
          writeFileSync(${JSON.stringify(join(root, 'ready'))}, 'ready'); setInterval(() => {}, 1000);` : '';
      for (const name of ['archive-consumer.mjs', 'archive-judge.mjs', 'archive-native.mjs', 'archive-offline-trap.mjs'])
        await writeFile(join(root, 'scripts/fixtures', name), source);
      await writeFile(join(root, 'check.ts'), `
import assert from 'node:assert/strict';
import { mkdirSync, existsSync } from 'node:fs';
import { ConsumerInterrupted, verifyRuntimeConsumers } from './scripts/delivery-consumers.ts';
const before = ['SIGINT', 'SIGTERM'].map(signal => process.listeners(signal));
const context = { root: ${JSON.stringify(root)}, installation: ${JSON.stringify(root)}, consumer: ${JSON.stringify(join(root, 'consumer'))} };
const outcome = ${JSON.stringify(outcome)};
if (outcome === 'spawn') process.env.PATH = '/nonexistent-lifetime-path';
if (outcome === 'marker') mkdirSync(context.root + '/.tenet-consumer-state');
const running = verifyRuntimeConsumers(context);
if (outcome === 'SIGINT' || outcome === 'SIGTERM') {
  const { existsSync } = await import('node:fs');
  const ready = ${JSON.stringify(join(root, 'ready'))};
  for (let i = 0; i < 200 && !existsSync(ready); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(existsSync(ready));
  process.kill(process.pid, outcome);
  await assert.rejects(running, error => error instanceof ConsumerInterrupted && error.signal === outcome
    && error.exitCode === (outcome === 'SIGINT' ? 130 : 143));
} else if (outcome === 'success') await running;
else {
  const expected = { marker: { code: 'EISDIR' }, assertion: /lifetime-assertion/, overflow: /exceeded output limit/, spawn: { code: 'ENOENT' } };
  await assert.rejects(running, expected[outcome]);
}
if (outcome === 'marker') assert.equal(existsSync(context.root + '/ready'), false, 'marker creation failure must prevent spawn');
assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listeners(signal)), before);
console.log('lifetime released after ${outcome}');
`);
      const env = await isolatedEnvironment(root, join(root, 'owner'));
      const result = spawnSync('bun', ['--no-env-file', 'check.ts'], { cwd: root, env, encoding: 'utf8', timeout: 15_000 });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, new RegExp(`lifetime released after ${outcome}`));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

for (const outcome of ['success', 'error', 'SIGINT', 'SIGTERM', 'error+SIGTERM'] as const)
  for (const shutdown of ['delayed', 'blocked', 'EPERM'] as const) {
  test(`consumer group shutdown waits for a descendant beyond consumer close after ${outcome} (${shutdown})`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-group-test-')));
    try {
      await mkdir(join(root, 'scripts/fixtures'), { recursive: true });
      await mkdir(join(root, 'consumer'));
      await mkdir(join(root, 'evidence'));
      for (const name of ['delivery-consumers.ts', 'isolated-environment.ts'])
        await cp(join(repository, 'scripts', name), join(root, 'scripts', name));
      const descendant = `
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const server = createServer((request, response) => response.end('still running'));
server.listen(0, '127.0.0.1', () => writeFileSync(process.argv[1], JSON.stringify({
  pid: process.pid, group: process.ppid, url: 'http://127.0.0.1:' + server.address().port
})));
`;
      const fixture = `
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const evidence = ${JSON.stringify(join(root, 'evidence'))} + '/' + process.pid + '.json';
spawn('node', ['--input-type=module', '-e', ${JSON.stringify(descendant)}, evidence], { stdio: 'ignore' });
for (let i = 0; i < 200 && !existsSync(evidence); i++) await new Promise(resolve => setTimeout(resolve, 5));
if (!existsSync(evidence)) throw new Error('descendant not ready');
${outcome === 'SIGINT' || outcome === 'SIGTERM' ? 'setInterval(() => {}, 1000);' : `process.exit(${outcome.startsWith('error') ? 1 : 0});`}
`;
      for (const name of ['archive-consumer.mjs', 'archive-judge.mjs', 'archive-native.mjs', 'archive-offline-trap.mjs'])
        await writeFile(join(root, 'scripts/fixtures', name), fixture);
      await writeFile(join(root, 'check.ts'), `
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { ConsumerInterrupted, ConsumerShutdownError, verifyRuntimeConsumers } from './scripts/delivery-consumers.ts';
const root = ${JSON.stringify(root)};
const outcome = ${JSON.stringify(outcome)};
const shutdown = ${JSON.stringify(shutdown)};
let duringBarrier = false;
const kill = process.kill.bind(process);
const pending = new Map<number, ReturnType<typeof setTimeout>>();
const evidence = () => readdirSync(root + '/evidence').map(name => JSON.parse(readFileSync(root + '/evidence/' + name, 'utf8')));
const alive = pid => { try { kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
process.kill = (pid, signal) => {
  if (pid < 0 && signal === 0 && shutdown === 'EPERM') throw Object.assign(new Error('deliberate probe failure'), { code: 'EPERM' });
  if (pid >= 0 || signal !== 'SIGKILL') return kill(pid, signal);
  if (outcome === 'error+SIGTERM' && !duringBarrier) {
    duringBarrier = true;
    setTimeout(() => kill(process.pid, 'SIGTERM'), 25);
  }
  if (shutdown === 'EPERM') return kill(pid, signal);
  if (!pending.has(pid)) {
    try { kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (shutdown === 'blocked') throw Object.assign(new Error('deliberate group kill failure'), { code: 'EPERM' });
    pending.set(pid, setTimeout(() => {
      try { kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      pending.delete(pid);
    }, 150));
  }
  return true;
};
try {
  let failure;
  const running = verifyRuntimeConsumers({ root, installation: root, consumer: root + '/consumer' }).catch(error => { failure = error; });
  if (outcome === 'SIGINT' || outcome === 'SIGTERM') {
    for (let i = 0; i < 200 && evidence().length === 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(evidence().length, 1);
    kill(process.pid, outcome);
  }
  await running;
  const interrupted = outcome.startsWith('SIG') || outcome === 'error+SIGTERM';
  const exitCode = outcome === 'SIGINT' ? 130 : 143;
  if (shutdown !== 'delayed') {
    assert.ok(failure instanceof ConsumerShutdownError);
    assert.equal(failure.interruption?.exitCode, interrupted ? exitCode : undefined);
    if (outcome.startsWith('error')) assert.match(failure.cause.message, /check.mjs exited 1/);
    else if (interrupted) assert.equal(failure.cause, failure.interruption);
    if (shutdown === 'blocked') assert.equal(failure.shutdownCause.cause.message, 'deliberate group kill failure');
  } else if (interrupted) {
    assert.ok(failure instanceof ConsumerInterrupted);
    assert.equal(failure.exitCode, exitCode);
  } else if (outcome === 'error') assert.match(failure.message, /check.mjs exited 1/);
  else assert.equal(failure, undefined);
  const remaining = evidence().filter(server => alive(server.pid));
  const http = await Promise.all(remaining.map(async server => (await fetch(server.url)).status));
  console.log('barrier-observation', JSON.stringify({ outcome, shutdown, pendingGroups: pending.size, liveDescendants: remaining.length, http }));
  assert.equal(remaining.length, shutdown === 'blocked' ? 1 : 0, 'consumer result waits for shutdown or explicitly reports retained ownership');
  assert.deepEqual(http, shutdown === 'blocked' ? [200] : []);
  assert.equal(readFileSync(root + '/.tenet-consumer-state', 'utf8'), '');
} finally {
  process.kill = kill;
  for (const timer of pending.values()) clearTimeout(timer);
}
`);
      const env = await isolatedEnvironment(root, join(root, 'owner'));
      const result = spawnSync('bun', ['--no-env-file', 'check.ts'], { cwd: root, env, encoding: 'utf8', timeout: 15_000 });
      console.log(result.stdout);
      assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {
      await cleanupFixture(root, async root => {
        const files = await readdir(join(root, 'evidence'));
        assert.ok(files.length, 'fixture recorded descendant ownership');
        return await Promise.all(files.map(async name => JSON.parse(await readFile(join(root, 'evidence', name), 'utf8')) as FixtureDescendant));
      });
      console.log('regression descendants absent');
    }
  });
}

test('ordinary checks invoke the offline lane and retain the separate archive and metadata gates', async () => {
  const ci = await readFile(join(repository, '.github/workflows/ci.yml'), 'utf8');
  const contributing = await readFile(join(repository, 'CONTRIBUTING.md'), 'utf8');
  const offline = ci.slice(ci.indexOf('  offline:'), ci.indexOf('  delivery:'));
  assert.match(offline, /scripts\/validate-offline\.sh --browser-cache/);
  const runner = await readFile(join(repository, 'scripts/validate-offline.sh'), 'utf8');
  assert.match(runner, /bun run delivery:check/);
  assert.ok(contributing.indexOf('bun run delivery:check') < contributing.indexOf('## Verify the delivery archive'));
  const delivery = ci.slice(ci.indexOf('  delivery:'));
  assert.match(delivery, /needs: \[offline\]/);
  assert.match(delivery, /- run: bun run package:archive/);
  assert.match(delivery, /- run: python3 -B scripts\/check-archive-metadata.py delivery\/tenet.tar.gz/);
});
