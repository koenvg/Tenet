import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { copyFile } from 'node:fs/promises';

await build({ configFile: fileURLToPath(new URL('vite.config.ts', import.meta.url)) });
await copyFile(fileURLToPath(new URL('../third-party/web/NOTICES.txt', import.meta.url)), fileURLToPath(new URL('dist/THIRD_PARTY_NOTICES.txt', import.meta.url)));
