import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
export async function summaryBuildFingerprint(): Promise<string> {
  async function files(path: string): Promise<string[]> {
    const entries = await readdir(new URL(path, root), { withFileTypes: true });
    const children = await Promise.all(entries.map(entry => entry.isDirectory() ? files(path + entry.name + '/')
      : /\.(tsx?|css)$/.test(entry.name) ? [path + entry.name] : []));
    return children.flat();
  }
  const paths = [...await files('inspector/src/'), ...await files('src/'),
    ...await files('web/'), 'inspector/vite.summary.config.ts', 'inspector/tsconfig.summary.json',
    'scripts/build-summary-types.ts', 'scripts/summary-build-inputs.ts', 'package.json', 'bun.lock'].sort();
  const hash = createHash('sha256');
  for (const path of paths) { hash.update(path + '\0'); hash.update(await readFile(new URL(path, root))); hash.update('\0'); }
  return hash.digest('hex');
}
