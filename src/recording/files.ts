import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

export const MAX_RECORD_BYTES = 4 * 1024 * 1024;
function owned(mode: number, uid: number): boolean {
  return (mode & 0o077) === 0 && (process.getuid === undefined || uid === process.getuid());
}
// Check every component, not just the final path. Never chmod an existing unsafe path.
export async function directory(path: string, create = false, privatePath = true): Promise<void> {
  if (!isAbsolute(path)) throw new Error('absolute-path-required');
  const parent = dirname(path);
  if (parent !== path) await directory(parent, false, false);
  try { if (create) await mkdir(path, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (privatePath && !owned(info.mode, info.uid))) throw new Error('unsafe-directory');
}
export async function ensureArchive(path: string): Promise<void> {
  // Missing parents are created privately, existing ancestors may be public but never symlinks.
  try { await directory(dirname(path), false, false); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === parse(path).root) throw error;
    await ensureArchive(dirname(path));
  }
  await directory(path, true);
}
export function contained(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
export async function readPrivateFile(root: string, path: string): Promise<string> {
  if (!contained(root, path)) throw new Error('outside-archive');
  await directory(root);
  await directory(dirname(path));
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || !owned(info.mode, info.uid) || info.size > MAX_RECORD_BYTES) throw new Error('unsafe-record');
    // A bounded read also protects against files growing after stat.
    const buffer = Buffer.alloc(MAX_RECORD_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > MAX_RECORD_BYTES) throw new Error('record-too-large');
    return buffer.subarray(0, used).toString('utf8');
  } finally { await handle.close(); }
}
