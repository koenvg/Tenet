import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** The caller owns root and removes it after closing all guards/subprocesses. */
export async function isolatedHome(root: string): Promise<{ HOME: string }> {
  const HOME = join(root, 'owner-home');
  await mkdir(HOME, { recursive: true, mode: 0o700 });
  return { HOME };
}
