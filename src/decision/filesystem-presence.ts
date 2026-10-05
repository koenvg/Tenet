import type { Stats } from 'node:fs';
import { lstat, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

export type FilesystemPresence = 'absent' | 'present' | 'unavailable';
export type PresenceFileSystem = {
  lstat(path: string): Promise<Pick<Stats, 'isDirectory' | 'isSymbolicLink'>>;
  stat(path: string): Promise<Pick<Stats, 'isDirectory'>>;
};

/** Presence is not readability: a broken source link is present and must fail loading.
 * Only a missing path beneath a confirmed directory is optional absence. */
export async function probeFilesystemPresence(source: string,
  fs: PresenceFileSystem = { lstat, stat }): Promise<FilesystemPresence> {
  try {
    await fs.lstat(source);
    return 'present';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 'unavailable';
  }
  let parent = dirname(source);
  for (;;) {
    let info;
    try { info = await fs.stat(parent); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 'unavailable';
      // Capture can create a directory after stat observed ENOENT.
      try { info = await fs.lstat(parent); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 'unavailable';
      }
    }
    if (info) {
      if (!info.isDirectory()) return 'unavailable';
      // Recheck skipped ancestors and the source before confirming absence.
      // A directory can appear together with a policy, broken link or file.
      for (let child = dirname(source);; child = dirname(child)) {
        let entry;
        try { entry = await fs.lstat(child); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 'unavailable';
        }
        if (entry) {
          try {
            const target = entry.isSymbolicLink() ? await fs.stat(child) : entry;
            if (!target.isDirectory()) return 'unavailable';
          } catch { return 'unavailable'; }
        } else if (child === parent) return 'unavailable';
        if (child === parent) break;
      }
      try { await fs.lstat(source); return 'present'; }
      catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'unavailable'; }
    }
    const next = dirname(parent);
    if (next === parent) return 'unavailable';
    parent = next;
  }
}
