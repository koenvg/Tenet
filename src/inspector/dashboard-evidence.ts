import { constants, type BigIntStats } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { contained, directory, MAX_RECORD_BYTES } from '../recording/files.js';

const stamp = (s: BigIntStats) => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.mode, s.uid, s.gid, s.nlink].join(':');

export class DashboardEvidence {
  private directories = new Map<string, string>();
  private files = new Map<string, string>();
  private bytes = 0;
  constructor(private root: string) {}
  private remember(entries: Map<string, string>, path: string, fingerprint: string) {
    const previous = entries.get(path);
    if (previous && previous !== fingerprint) throw Error('archive-evidence-changed');
    if (!previous) {
      this.bytes += Buffer.byteLength(path) + Buffer.byteLength(fingerprint) + 128;
      if (this.bytes > 16 * 1024 * 1024 || this.files.size + this.directories.size >= 65536) throw Error('evidence-manifest-limit');
      entries.set(path, fingerprint);
    }
  }
  async directory(path: string): Promise<string> {
    const info = await lstat(path, { bigint: true });
    this.remember(this.directories, path, stamp(info));
    await directory(path);
    return `${info.dev}:${info.ino}`;
  }
  async file(path: string): Promise<string> {
    if (!contained(this.root, path)) throw Error('outside-archive');
    await directory(dirname(path));
    const rootInfo = await lstat(this.root, { bigint: true });
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || (rootInfo.mode & 0o077n) !== 0n || (process.getuid && rootInfo.uid !== BigInt(process.getuid()))) throw Error('unsafe-directory');
    const fingerprint = stamp(await lstat(path, { bigint: true }));
    this.remember(this.files, path, fingerprint);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const s = await handle.stat({ bigint: true });
      if (!s.isFile() || s.nlink !== 1n || (s.mode & 0o077n) !== 0n || (process.getuid && s.uid !== BigInt(process.getuid())) || s.size > BigInt(MAX_RECORD_BYTES)) throw Error('unsafe-record');
      if (stamp(s) !== fingerprint) throw Error('record-changed');
      return fingerprint;
    } finally { await handle.close(); }
  }
  async verify(path: string): Promise<void> {
    if (stamp(await lstat(path, { bigint: true })) !== this.files.get(path)) throw Error('archive-evidence-changed');
  }
  async current(keepChecking = () => true): Promise<boolean> {
    try {
      await directory(this.root);
      for (const [path, fingerprint] of this.directories) {
        if (!keepChecking()) return false;
        if (stamp(await lstat(path, { bigint: true })) !== fingerprint) return false;
      }
      for (const [path, fingerprint] of this.files) {
        if (!keepChecking() || stamp(await lstat(path, { bigint: true })) !== fingerprint) return false;
      }
      return keepChecking();
    } catch { return false; }
  }
}
