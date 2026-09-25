import { randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync, watch, type FSWatcher } from 'node:fs';
import { open, rename, rm, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { ensureArchive } from '../recording/files.js';

export type Activation = 'on' | 'off' | 'unavailable';
const MAX_BYTES = 1024;
const privateOwner = (mode: number, uid: number) =>
  (mode & 0o077) === 0 && (process.getuid === undefined || uid === process.getuid());

/** A cooperative same-user control, not a security boundary. */
export class ActivationStore {
  private seen = false;
  private last: Activation = 'on';
  private observer?: (value: Activation) => void;
  private watcher?: FSWatcher;
  private timer?: NodeJS.Timeout;

  constructor(readonly path = join(homedir(), '.tenet', 'control.json')) {
    if (!isAbsolute(path)) throw new Error('absolute-control-path-required');
  }

  read(): Activation {
    let fd: number | undefined;
    try {
      const root = dirname(this.path);
      let ancestor = root;
      let missing = false;
      for (;;) {
        try {
          const info = lstatSync(ancestor);
          if (!info.isDirectory() || info.isSymbolicLink()
            || (ancestor === root && !privateOwner(info.mode, info.uid))) return 'unavailable';
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 'unavailable';
          missing = true;
        }
        const parent = dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
      if (missing) return this.seen ? 'unavailable' : 'on';
      fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      this.seen = true;
      const info = fstatSync(fd);
      if (!info.isFile() || info.nlink !== 1 || !privateOwner(info.mode, info.uid) || info.size > MAX_BYTES) return 'unavailable';
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count > MAX_BYTES) return 'unavailable';
      const selected = lstatSync(this.path);
      if (!selected.isFile() || selected.dev !== info.dev || selected.ino !== info.ino) return 'unavailable';
      const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count)));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || Object.keys(parsed).sort().join(',') !== 'activation,version'
        || (parsed as { version?: unknown }).version !== 1
        || !['on', 'off'].includes((parsed as { activation?: string }).activation ?? '')) return 'unavailable';
      return (parsed as { activation: 'on' | 'off' }).activation;
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      return missing && !this.seen ? 'on' : 'unavailable';
    } finally { if (fd !== undefined) closeSync(fd); }
  }

  async write(value: 'on' | 'off'): Promise<Activation> {
    await ensureArchive(dirname(this.path));
    try {
      const info = await lstat(this.path);
      if (!info.isFile() || info.nlink !== 1 || !privateOwner(info.mode, info.uid)) throw new Error('unsafe-control');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    let created = false;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      created = true;
      try { await handle.writeFile(JSON.stringify({ version: 1, activation: value }) + '\n'); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, this.path);
      // Flush the directory entry as well as the file before acknowledging the command.
      const dir = await open(dirname(this.path), 'r');
      try { await dir.sync(); } finally { await dir.close(); }
      this.refresh();
      return this.read();
    } finally { if (created) await rm(temporary, { force: true }).catch(() => {}); }
  }

  watch(observer: (value: Activation) => void): void {
    this.close();
    this.observer = observer;
    this.last = this.read();
    this.attach();
    this.timer = setInterval(() => { this.attach(); this.refresh(); }, 250);
    this.timer.unref();
  }

  refresh(): Activation {
    const previous = this.last;
    const value = this.read();
    this.last = value;
    if (value !== previous) {
      try { this.observer?.(value); } catch { /* Boundary reads still apply if owner UI reporting fails. */ }
    }
    return value;
  }

  close(): void {
    this.observer = undefined;
    this.watcher?.close();
    this.watcher = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private attach(): void {
    if (this.watcher || !existsSync(dirname(this.path))) return;
    try {
      this.watcher = watch(dirname(this.path), { persistent: false }, () => this.refresh());
      this.watcher.on('error', () => { this.watcher?.close(); this.watcher = undefined; });
    } catch { /* The periodic refresh is the fallback. */ }
  }
}
