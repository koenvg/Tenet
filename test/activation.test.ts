import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { chmod, lstat, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivationStore } from '../src/pi/activation.js';

async function fixture(work: (path: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-control-')));
  try { await work(join(root, 'control.json')); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('activation store validates, persists and atomically replaces private choices', async () => fixture(async path => {
  const first = new ActivationStore(path), second = new ActivationStore(path);
  assert.equal(first.read(), 'on');
  await first.write('off');
  assert.equal(second.read(), 'off');
  assert.equal((await lstat(path)).mode & 0o777, 0o600);
  await Promise.all([first.write('on'), second.write('off')]);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 1);
  assert.ok(['on', 'off'].includes(first.read()));
  await first.write('on');
  assert.equal(second.read(), 'on');
  await rm(path);
  assert.equal(second.read(), 'unavailable', 'a previously seen file cannot disappear silently');
  assert.equal(new ActivationStore(path).read(), 'on', 'fresh missing state is compatible with existing installations');
}));

test('activation rejects malformed, oversized, unsafe and unreadable control paths; commands repair safe corrupt files', async () => fixture(async path => {
  const store = new ActivationStore(path);
  await writeFile(path, '{', { mode: 0o600 });
  assert.equal(store.read(), 'unavailable');
  await store.write('off');
  assert.equal(store.read(), 'off');
  await writeFile(path, 'x'.repeat(2048));
  assert.equal(store.read(), 'unavailable');
  await chmod(path, 0o644);
  assert.equal(store.read(), 'unavailable');
  await assert.rejects(store.write('on'));
  await rm(path);
  const target = join(path, '..', 'target');
  await writeFile(target, 'secret');
  await symlink(target, path);
  assert.equal(store.read(), 'unavailable');
  await assert.rejects(store.write('on'));
  await rm(path);
  await mkdir(path);
  assert.equal(store.read(), 'unavailable');
  await assert.rejects(store.write('on'));
}));

test('activation keeps the exact two-field control schema', async () => fixture(async path => {
  const store = new ActivationStore(path);
  for (const value of [
    { version: 1, activation: 'off', extra: true },
    { version: 2, activation: 'off' },
    { version: 1 },
    { version: 1, activation: 'unavailable' },
    { version: '1', activation: 'on' },
  ]) {
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
    assert.equal(store.read(), 'unavailable');
  }
}));

test('activation keeps seen-absence rules for missing directories', async () => fixture(async path => {
  const nested = join(path, '..', 'private', 'control.json');
  const store = new ActivationStore(nested);
  assert.equal(store.read(), 'on');
  await store.write('off');
  assert.equal(store.read(), 'off');
  await rm(join(nested, '..'), { recursive: true });
  assert.equal(store.read(), 'unavailable');
  assert.equal(new ActivationStore(nested).read(), 'on');
}));

test('activation rejects a symlinked ancestor even when the final file is private', async () => fixture(async path => {
  const folder = join(path, '..', 'target-folder');
  await mkdir(join(folder, 'nested'), { recursive: true, mode: 0o700 });
  await writeFile(join(folder, 'nested', 'control.json'), '{"version":1,"activation":"off"}', { mode: 0o600 });
  const link = join(path, '..', 'alias');
  await symlink(folder, link);
  const viaLink = new ActivationStore(join(link, 'nested', 'control.json'));
  assert.equal(viaLink.read(), 'unavailable');
  await assert.rejects(viaLink.write('on'));
}));

test('activation fails writes without a private writable directory', async () => fixture(async path => {
  const root = join(path, '..');
  await chmod(root, 0o755);
  try {
    const store = new ActivationStore(path);
    assert.equal(store.read(), 'unavailable');
    await assert.rejects(store.write('off'));
  } finally { await chmod(root, 0o700); }
}));

test('watch observes other writers and stops on shutdown', async () => fixture(async path => {
  const first = new ActivationStore(path), second = new ActivationStore(path);
  const changes: string[] = [];
  second.watch(value => changes.push(value));
  try {
    await first.write('off');
    const deadline = Date.now() + 1200;
    while (!changes.includes('off') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(changes.includes('off'));
    await first.write('on');
    while (!changes.includes('on') && Date.now() < deadline + 1200) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(changes.includes('on'));
    second.close();
    const count = changes.length;
    await first.write('off');
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(changes.length, count);
  } finally { second.close(); }
}));

test('a separate Bun process observes changes while idle and exits after closing its watcher', async () => fixture(async path => {
  const script = `import { ActivationStore } from './src/pi/activation.ts';
    const store = new ActivationStore(process.argv.at(-1));
    store.watch(value => console.log(value));
    console.log('ready');
    process.stdin.on('data', () => { store.close(); process.exit(0); });`;
  const child = spawn(process.execPath, ['-e', script, path], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
  const messages: string[] = [];
  let buffer = '';
  child.stdout.on('data', data => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    messages.push(...lines);
  });
  let errors = '';
  child.stderr.on('data', data => { errors += data.toString(); });
  const wait = async (message: string) => {
    const deadline = Date.now() + 3000;
    while (!messages.includes(message)) {
      if (Date.now() > deadline || child.exitCode !== null) throw new Error(`Child missed ${message}: ${errors}; ${messages.join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  try {
    await wait('ready');
    const writer = new ActivationStore(path);
    await writer.write('off');
    await wait('off');
    await writer.write('on');
    await wait('on');
    const ended = new Promise<number | null>(resolve => child.once('exit', resolve));
    child.stdin.write('stop');
    assert.equal(await ended, 0);
  } finally { child.kill(); }
}));
