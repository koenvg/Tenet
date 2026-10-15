import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
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
