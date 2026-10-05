import { access, readFile } from 'node:fs/promises';
import { summaryBuildFingerprint } from './summary-build-inputs.js';
const output = new URL('../bb-plugin-tenet-status/.summary-workspace/', import.meta.url);
try {
  for (const file of ['summary.js', 'summary.css', 'summary.d.ts', 'types/inspector/src/shared/library.svelte.d.ts']) {
    await access(new URL(file, output));
  }
  const stamp = JSON.parse(await readFile(new URL('build.json', output), 'utf8'));
  if (stamp.fingerprint !== await summaryBuildFingerprint()) throw new Error('stale-summary-build');
} catch {
  console.error('Shared summary build missing or stale. Run bun run summary:build from the repository root before building the plugin.');
  process.exit(1);
}
