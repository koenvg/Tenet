import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Deliberately outside the checkout with no Pi, frontend or runtime dependencies.
async function consumer() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-sdk-consumer-')));
  const pkg = join(root, 'node_modules', 'tenet');
  await mkdir(pkg, { recursive: true });
  await cp(join(repo, 'dist'), join(pkg, 'dist'), { recursive: true });
  const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: manifest.name, type: 'module', exports: manifest.exports }));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await mkdir(join(root, 'home'));
  return { root, pkg, env: { ...process.env, HOME: join(root, 'home'), TYPESAFE_API_KEY: '', NODE_PATH: '', TENET_RECORDING: 'off' },
    close: () => rm(root, { recursive: true, force: true }) };
}

for (const runtime of ['node', 'bun']) {
  test(`compiled alpha entry imports and runs the guide under isolated ${runtime}`, async () => {
    const h = await consumer();
    try {
      await writeFile(join(h.root, 'import.mjs'), `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
const trap = () => { throw new Error('import side effect'); };
fs.watch = trap; fs.watchFile = trap; fs.mkdirSync = trap; fs.writeFileSync = trap;
fsp.mkdir = trap; fsp.writeFile = trap; fsp.rename = trap;
http.request = trap; https.request = trap; globalThis.fetch = trap;
syncBuiltinESMExports();
const before = fs.readdirSync(process.cwd(), { recursive: true }).sort();
const sdk = await import('tenet');
assert.deepEqual(Object.keys(sdk).sort(), ['SDK_VERSION', 'createGuard']);
assert.equal(sdk.SDK_VERSION, 'alpha-1');
const guard = sdk.createGuard({ host: 'isolated', env: { TENET_RECORDING: 'off' } });
await guard.close();
assert.deepEqual(fs.readdirSync(process.cwd(), { recursive: true }).sort(), before);
console.log('side-effect-free import');
`);
      const output = execFileSync(runtime, ['import.mjs'], { cwd: h.root, env: h.env, encoding: 'utf8', timeout: 10000 });
      assert.match(output, /side-effect-free import/);
      await cp(join(repo, 'examples/dist/sdk.js'), join(h.root, 'guide.mjs'));
      const guide = execFileSync(runtime, ['guide.mjs'], { cwd: h.root, env: h.env, encoding: 'utf8', timeout: 10000 });
      assert.match(guide, /SDK example passed/);
      await cp(join(repo, 'test/sdk-handoff-fixture.mjs'), join(h.root, 'handoff.mjs'));
      assert.match(execFileSync(runtime, ['handoff.mjs'], { cwd: h.root, env: h.env, encoding: 'utf8', timeout: 10000 }), /SDK handoff regressions passed/);
      assert.equal((await readFile(join(h.pkg, 'dist/sdk/index.js'), 'utf8')).includes('src/pi'), false);
      await assert.rejects(readFile(join(h.root, 'node_modules/@earendil-works/pi-coding-agent/package.json')));
    } finally { await h.close(); }
  });
}

test('isolated TypeScript consumer resolves public declarations without source, Pi or frontend tooling', async () => {
  const h = await consumer();
  try {
    // Node platform types are the consumer's only ambient dependency.
    await mkdir(join(h.root, 'node_modules/@types'), { recursive: true });
    await symlink(join(repo, 'node_modules/@types/node'), join(h.root, 'node_modules/@types/node'));
    await symlink(join(repo, 'node_modules/undici-types'), join(h.root, 'node_modules/undici-types'));
    await cp(join(repo, 'examples/sdk.ts'), join(h.root, 'consumer.ts'));
    await cp(join(repo, 'test/sdk-assessment-types.fixture.ts'), join(h.root, 'assessment-types.ts'));
    await writeFile(join(h.root, 'capabilities.ts'), `
import type { Capability, GuardOptions } from 'tenet';
const capabilities: readonly Capability[] = ['interception', 'result-correlation', 'lifecycle-invalidation'];
const minimal: GuardOptions = { host: 'consumer' };
const declared: GuardOptions = { host: 'consumer', capabilities };
// @ts-expect-error old boolean-object declarations are not supported
const legacy: GuardOptions = { host: 'consumer', capabilities: { trustedApproval: true } };
// @ts-expect-error capability names are a closed union
const unknown: GuardOptions = { host: 'consumer', capabilities: ['trust-everything'] };
// @ts-expect-error a stable host identity is required
const noHost: GuardOptions = { capabilities };
void [minimal, declared, legacy, unknown, noHost];
`);
    await writeFile(join(h.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'NodeNext',
      moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false }, include: ['consumer.ts', 'capabilities.ts', 'assessment-types.ts'] }));
    execFileSync('node', [join(repo, 'node_modules/typescript/bin/tsc'), '-p', h.root], { cwd: h.root, env: h.env, encoding: 'utf8', timeout: 20000 });
    execFileSync('node', [join(repo, 'node_modules/typescript/bin/tsc'), '-p', h.root, '--exactOptionalPropertyTypes'],
      { cwd: h.root, env: h.env, encoding: 'utf8', timeout: 20000 });
    await assert.rejects(readFile(join(h.pkg, 'src/sdk/index.ts')));
  } finally { await h.close(); }
});

test('compiled SDK releases shared control watches after the last session closes', async () => {
  const h = await consumer();
  try {
    await writeFile(join(h.root, 'resources.mjs'), `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { createGuard } from 'tenet';
await fsp.mkdir('control', { mode: 0o700 });
await fsp.writeFile('TENET.md', 'Rule; WARN; Keep changes focused.');
let watches = 0; const timers = new Set();
const originalWatch = fs.watch;
fs.watch = (...args) => {
  const watcher = originalWatch(...args); watches++;
  const originalClose = watcher.close.bind(watcher); let closed = false;
  watcher.close = () => { if (!closed) { closed = true; watches--; } return originalClose(); };
  return watcher;
};
const originalInterval = globalThis.setInterval; const originalClear = globalThis.clearInterval;
globalThis.setInterval = (...args) => { const t = originalInterval(...args); timers.add(t); return t; };
globalThis.clearInterval = t => { timers.delete(t); originalClear(t); };
syncBuiltinESMExports();
const guard = createGuard({ env: { TENET_RECORDING: 'off' }, controlPath: process.cwd() + '/control/state.json',
 judge: async () => new Promise(() => {}),
 host: 'lifecycle', capabilities: ['interception', 'result-correlation', 'lifecycle-invalidation'] });
assert.equal(watches, 0); assert.equal(timers.size, 0);
const one = guard.openSession({ sessionId: 'one', contextId: 'main' }, process.cwd());
const two = guard.openSession({ sessionId: 'two', contextId: 'main' }, process.cwd());
await Promise.all([one.ready, two.ready]);
assert.equal(watches, 1); assert.equal(timers.size, 1);
await one.close(); assert.equal(watches, 1); assert.equal(timers.size, 1);
await two.close(); assert.equal(watches, 0); assert.equal(timers.size, 0);
await guard.close(); await guard.close();
console.log('owned watches released');
`);
    assert.match(execFileSync('node', ['resources.mjs'], { cwd: h.root, env: h.env, encoding: 'utf8', timeout: 10000 }), /owned watches released/);
  } finally { await h.close(); }
});
