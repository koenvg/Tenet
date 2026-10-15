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

async function checkout(check: (root: string, checkout: string) => Promise<void>) {
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
  } finally { await rm(root, { recursive: true, force: true }); }
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

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

for (const entry of ['canonical', 'standalone'] as const) for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`${entry} delivery stage stops the real SDK consumer and inspector before cleanup on ${signal}`, { timeout: 120_000 }, async () => {
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
      const fixture = join(copy, 'scripts/fixtures/archive-consumer.mjs');
      const source = await readFile(fixture, 'utf8');
      const ready = 'const htmlResponse = await fetchHTTP(url);';
      assert.ok(source.includes(ready));
      await writeFile(fixture, source.replace(ready, `
await writeFile(${JSON.stringify(evidence)}, JSON.stringify({
  consumer: process.pid, inspector: inspector.pid, url,
  state: process.env.TMPDIR, lane: process.env.TMPDIR.slice(0, process.env.TMPDIR.lastIndexOf('/'))
}));
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
      let cleanupError: unknown;
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
        console.log(`${signal} ${entry} delivery interruption: ${JSON.stringify(observed)}`);
        assert.deepEqual(observed, { consumerAlive: false, inspectorAlive: false, stateExists: false, laneExists: entry === 'standalone' });
        assert.deepEqual(removedWhileAlive, [], 'temporary state must remain until both descendants stop');
        await assert.rejects(fetch(server.url), /fetch|connect/i);
        assert.ok(existsSync(join(root, 'cache')), 'unowned browser cache remains');
      } finally {
        if (!finished) {
          child.kill('SIGTERM');
          for (let i = 0; i < 500 && !finished; i++) await sleep(10);
          if (!finished) child.kill('SIGKILL');
        }
        if (server && (alive(server.consumer) || alive(server.inspector))) {
          try { process.kill(-server.consumer, 'SIGKILL'); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') cleanupError = error; }
          for (let i = 0; i < 200 && (alive(server.consumer) || alive(server.inspector)); i++) await sleep(10);
        }
        await done;
      }
      if (cleanupError) throw cleanupError;
    });
  });
}

for (const outcome of ['success', 'assertion', 'overflow', 'spawn', 'SIGINT', 'SIGTERM'] as const) {
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
        : interrupted ? `import {writeFileSync} from 'node:fs';
          writeFileSync(${JSON.stringify(join(root, 'ready'))}, 'ready'); setInterval(() => {}, 1000);` : '';
      for (const name of ['archive-consumer.mjs', 'archive-judge.mjs', 'archive-native.mjs', 'archive-offline-trap.mjs'])
        await writeFile(join(root, 'scripts/fixtures', name), source);
      await writeFile(join(root, 'check.ts'), `
import assert from 'node:assert/strict';
import { ConsumerInterrupted, verifyRuntimeConsumers } from './scripts/delivery-consumers.ts';
const before = ['SIGINT', 'SIGTERM'].map(signal => process.listeners(signal));
const context = { root: ${JSON.stringify(root)}, installation: ${JSON.stringify(root)}, consumer: ${JSON.stringify(join(root, 'consumer'))} };
const outcome = ${JSON.stringify(outcome)};
if (outcome === 'spawn') process.env.PATH = '/nonexistent-lifetime-path';
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
  const expected = { assertion: /lifetime-assertion/, overflow: /exceeded output limit/, spawn: { code: 'ENOENT' } };
  await assert.rejects(running, expected[outcome]);
}
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
