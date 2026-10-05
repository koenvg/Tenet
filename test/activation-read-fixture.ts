import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Each run gets its own process and real temporary files. No owner paths are read.
const actual = { ...fs };
const scenario = process.argv[2];
const root = actual.realpathSync(actual.mkdtempSync(join(tmpdir(), 'tenet-control-read-')));
const ancestor = join(root, 'ancestor');
const directory = join(ancestor, 'private');
const path = join(directory, 'control.json');
const relocated = join(root, 'relocated');
actual.mkdirSync(directory, { recursive: true, mode: 0o700 });
const content = '{"version":1,"activation":"off"}\n';
actual.writeFileSync(path, content, { mode: 0o600 });
const before = actual.lstatSync(path);
let armed = false;
let intercepted = false;
let descriptor: number | undefined;
let mutationError: unknown;

function change() {
  intercepted = true;
  try {
    switch (scenario) {
      case 'unchanged':
      case 'short-read':
      case 'descriptor-ctime':
        break;
      case 'ancestor-symlink':
        actual.renameSync(ancestor, relocated);
        actual.symlinkSync(relocated, ancestor);
        break;
      case 'ancestor-replacement':
        actual.renameSync(ancestor, relocated);
        actual.mkdirSync(ancestor, { mode: 0o700 });
        actual.renameSync(join(relocated, 'private'), directory);
        break;
      case 'directory-symlink':
        actual.renameSync(directory, relocated);
        actual.symlinkSync(relocated, directory);
        break;
      case 'directory-replacement':
        actual.renameSync(directory, relocated);
        actual.mkdirSync(directory, { mode: 0o700 });
        actual.renameSync(join(relocated, 'control.json'), path);
        break;
      case 'directory-mode':
        actual.chmodSync(directory, 0o755);
        break;
      case 'file-replacement':
        actual.writeFileSync(join(root, 'replacement'), content, { mode: 0o600 });
        actual.renameSync(join(root, 'replacement'), path);
        break;
      case 'file-symlink':
        actual.renameSync(path, relocated);
        actual.symlinkSync(relocated, path);
        break;
      case 'file-missing':
        actual.unlinkSync(path);
        break;
      case 'file-mode':
      case 'path-mode':
        actual.chmodSync(path, 0o400);
        break;
      case 'file-links':
        actual.linkSync(path, relocated);
        break;
      case 'file-size':
        actual.appendFileSync(path, ' ');
        break;
      case 'file-mtime':
        actual.utimesSync(path, before.atime, new Date('2000-01-01T00:00:00Z'));
        break;
      case 'file-content':
        actual.writeFileSync(path, '{"version":1,"activation":"on"} \n');
        // Force a distinct timestamp without a clock delay or filesystem precision assumption.
        actual.utimesSync(path, before.atime, new Date('2000-01-01T00:00:00Z'));
        break;
      default:
        throw new Error(`unknown-scenario: ${scenario}`);
    }
  } catch (error) {
    mutationError = error;
    throw error;
  }
}

Object.assign(fs, {
  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number | null) {
    const count = actual.readSync(fd, buffer, offset, length, position);
    if (!armed) return count;
    descriptor = fd;
    if (!intercepted && scenario !== 'path-mode') change();
    return scenario === 'short-read' ? count - 1 : count;
  },
  fstatSync(fd: number) {
    const info = actual.fstatSync(fd);
    // A metadata-only descriptor change, independent of timestamp resolution.
    if (armed && intercepted && scenario === 'descriptor-ctime') info.ctimeMs += 1000;
    return info;
  },
  lstatSync(selected: fs.PathLike) {
    if (armed && !intercepted && scenario === 'path-mode' && selected === path) change();
    return actual.lstatSync(selected);
  },
});
syncBuiltinESMExports();

try {
  const { ActivationStore } = await import('../dist/runtime/activation.js');
  const store = new ActivationStore(path);
  assert.equal(store.read(), 'off', 'the fixture starts with a valid control');
  armed = true;
  const value = store.read();
  if (mutationError) throw mutationError;
  let closed = false;
  try { actual.fstatSync(descriptor!); }
  catch (error) { closed = (error as NodeJS.ErrnoException).code === 'EBADF'; }
  let sameInode = false;
  if (actual.existsSync(path)) {
    const selected = actual.statSync(path);
    sameInode = selected.dev === before.dev && selected.ino === before.ino;
  }
  console.log(JSON.stringify({ value, intercepted, closed, sameInode }));
} finally {
  actual.rmSync(root, { recursive: true, force: true });
}
