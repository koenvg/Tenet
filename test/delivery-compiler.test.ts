import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedEnvironment, isolatedArgs } from '../scripts/isolated-environment.js';

const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const typeRoots = fileURLToPath(new URL('../node_modules/@types', import.meta.url));
const verifier = new URL('../scripts/verify-delivery.ts', import.meta.url).href;

type CompilerResult = { trace?: string; status?: number; stdout?: string; stderr?: string; stack?: string };

async function compile(source: string, check: (result: CompilerResult, stderr: string, declarations: string) => void, noisyCompiler = false, uncaught = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-compiler-')));
  try {
    const home = join(root, 'home');
    const env = { ...await isolatedEnvironment(root, home), TMPDIR: '/tmp' };
    const packageRoot = join(root, 'node_modules/resolution-chatter-canary');
    const declarations = join(packageRoot, 'dist/sdk/index.d.ts');
    await mkdir(join(packageRoot, 'dist/sdk'), { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'resolution-chatter-canary', type: 'module',
      exports: { '.': { types: './dist/sdk/index.d.ts' } } }));
    await writeFile(declarations, 'export declare const value: string;\n');
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'check.ts'), `import { value } from 'resolution-chatter-canary';\n${source}\n`);
    await writeFile(join(root, '.env'), 'TYPESAFE_API_KEY=dotenv-credential-canary\nTENET_POLICY=dotenv-policy-canary\n');
    const selectedCompiler = noisyCompiler ? join(root, 'compiler.cjs') : compiler;
    if (noisyCompiler) await writeFile(selectedCompiler, `
      const { spawnSync } = require('node:child_process');
      const child = spawnSync(process.execPath, [${JSON.stringify(compiler)}, ...process.argv.slice(2)], { encoding: 'utf8' });
      process.stdout.write('unrelated-provider-body-canary\\n');
      process.stderr.write(child.stdout + child.stderr + 'private-settings-body-canary\\n');
      process.exitCode = child.status;
    `);
    await writeFile(join(root, 'driver.ts'), `
      import assert from 'node:assert/strict';
      import { homedir } from 'node:os';
      import { runConsumerCompiler } from ${JSON.stringify(new URL('../scripts/delivery-consumers.ts', import.meta.url).href)};
      assert.equal(homedir(), ${JSON.stringify(home)});
      for (const key of ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TENET_POLICY', 'NODE_OPTIONS'])
        assert.equal(process.env[key], undefined);
      try {
        const trace = runConsumerCompiler(${JSON.stringify(selectedCompiler)}, ${JSON.stringify(typeRoots)}, process.cwd(), process.env);
        console.log(JSON.stringify({ trace }));
      } catch (error) {
        if (${uncaught}) {
          assert.equal(error.status, 2);
          throw error;
        }
        console.log(JSON.stringify({ status: error.status, stdout: error.stdout, stderr: error.stderr, stack: error.stack }));
        process.exitCode = error.status ?? 1;
      }
    `);
    const child = spawnSync('bun', isolatedArgs('bun', ['driver.ts']), {
      cwd: root, env, encoding: 'utf8', stdio: 'pipe', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(child.error, undefined);
    const result = uncaught ? { status: child.status! } : JSON.parse(child.stdout) as CompilerResult;
    if (uncaught) assert.equal(child.stdout, '');
    assert.equal(child.status, result.status ?? 0);
    check(result, child.stderr, declarations);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('consumer compiler returns successful resolution trace without diagnostic logging', async () => {
  await compile('value.toUpperCase();', (result, stderr, declarations) => {
    assert.equal(stderr, '');
    assert.ok(result.trace?.includes(declarations), 'consumer must resolve package declarations');
    assert.ok(result.trace?.includes('was successfully resolved'));
    assert.equal(result.status, undefined);
  });
});

test('consumer compiler reports several real diagnostics after filtering resolution chatter and retains the failure status', async () => {
  await compile('value.missingOne;\nvalue.missingTwo;\nvalue.missingThree;', (result, stderr) => {
    assert.equal(result.status, 2);
    assert.equal(result.stderr, undefined);
    assert.equal(result.stdout, undefined);
    assert.equal(stderr, "Isolated TypeScript consumer check failed (exit status 2).\n"
      + "check.ts(2,7): error TS2339: Property 'missingOne' does not exist on type 'string'.\n"
      + "check.ts(3,7): error TS2339: Property 'missingTwo' does not exist on type 'string'.\n"
      + "check.ts(4,7): error TS2339: Property 'missingThree' does not exist on type 'string'.\n");
    assert.ok(!stderr.includes('resolution-chatter-canary'));
    assert.ok(!stderr.includes('dotenv-credential-canary'));
  });
});

test('consumer compiler bounds oversize diagnostics and marks truncation without exposing raw captured output', async () => {
  const properties = Array.from({ length: 200 }, (_, i) => `missing${i}_${'x'.repeat(100)}`);
  await compile(properties.map(property => `value.${property};`).join('\n'), (result, stderr) => {
    assert.equal(result.status, 2);
    assert.ok(stderr.includes(`Property '${properties[0]}'`));
    assert.ok(stderr.endsWith('[TypeScript diagnostics truncated]\n'));
    assert.ok(stderr.length <= 8_200, `diagnostic log must stay bounded, got ${stderr.length}`);
    assert.ok(!stderr.includes(properties[199]!));
    assert.equal(result.stdout, undefined);
    assert.equal(result.stderr, undefined);
    assert.ok(!stderr.includes('resolution-chatter-canary'));
  });
});

test('consumer compiler captures but never forwards unrelated stdout and stderr bodies', async () => {
  await compile('value.missing;', (result, stderr) => {
    assert.equal(result.status, 2);
    assert.equal(result.stdout, undefined);
    assert.equal(result.stderr, undefined);
    assert.equal(stderr, "Isolated TypeScript consumer check failed (exit status 2).\n"
      + "check.ts(2,7): error TS2339: Property 'missing' does not exist on type 'string'.\n");
  }, true);
});

test('uncaught compiler failure stays bounded without raw traces or unrelated bodies', async () => {
  const properties = Array.from({ length: 200 }, (_, i) => `missing${i}_${'x'.repeat(100)}`);
  await compile(properties.map(property => `value.${property};`).join('\n'), (result, stderr) => {
    assert.equal(result.status, 1, 'uncaught failure must still fail the archive process');
    assert.ok(stderr.includes(`Property '${properties[0]}'`));
    assert.ok(stderr.includes('[TypeScript diagnostics truncated]'));
    assert.ok(stderr.length < 12_000, `entire CLI stderr must stay bounded, got ${stderr.length}`);
    for (const omitted of [properties[199]!, 'Resolving module', 'resolution-chatter-canary',
      'unrelated-provider-body-canary', 'private-settings-body-canary', 'dotenv-credential-canary'])
      assert.ok(!stderr.includes(omitted), `uncaught output must omit ${omitted}`);
  }, true, true);
});

test('noncompiler archive failure does not gain compiler or general captured-output logging', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-noncompiler-')));
  try {
    const env = { ...await isolatedEnvironment(root, join(root, 'home')), TMPDIR: '/tmp' };
    await writeFile(join(root, 'invalid.tar.gz'), 'unrelated-provider-body-canary');
    await writeFile(join(root, 'driver.ts'), `
      import { verifyArchive } from ${JSON.stringify(verifier)};
      try { await verifyArchive('invalid.tar.gz'); }
      catch (error) { console.log(JSON.stringify({ status: error.status })); }
    `);
    const child = spawnSync('bun', isolatedArgs('bun', ['driver.ts']), {
      cwd: root, env, encoding: 'utf8', stdio: 'pipe', timeout: 30_000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0);
    assert.ok(JSON.parse(child.stdout).status > 0, 'tar must reject the invalid archive');
    assert.ok(!child.stderr.includes('Isolated TypeScript'));
    assert.ok(!child.stderr.includes('unrelated-provider-body-canary'));
    assert.ok(!child.stderr.includes('No TypeScript diagnostics'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
