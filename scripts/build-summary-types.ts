import { writeFile, access } from 'node:fs/promises';
import { summaryBuildFingerprint } from './summary-build-inputs.js';
const output = new URL('../bb-plugin-tenet-status/.summary-workspace/', import.meta.url);
for (const file of ['summary.js', 'summary.css', 'types/inspector/src/shared/library.svelte.d.ts']) {
  await access(new URL(file, output));
}
await writeFile(new URL('summary.d.ts', output), "export * from './types/inspector/src/shared/library.svelte.js';\n");
await writeFile(new URL('build.json', output), JSON.stringify({ fingerprint: await summaryBuildFingerprint() }) + '\n');
