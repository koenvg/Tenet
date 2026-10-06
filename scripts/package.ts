import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDelivery, deliveryManifest } from './delivery-contract.js';
import { verifyArchive } from './verify-delivery.js';
import { isolatedEnvironment, isolatedArgs } from './isolated-environment.js';

const repository = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.argv[2] ?? join(repository, 'delivery/tenet.tar.gz'));
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'tenet-package-')));
const env = await isolatedEnvironment(temporary, join(temporary, 'home'));
const run = (file: string, args: string[], cwd: string) => execFileSync(file, isolatedArgs(file, args), { cwd, env, stdio: 'inherit', timeout: 180_000 });
try {
  const stage = join(temporary, 'tenet'); await mkdir(stage);
  run('bun', ['--bun', 'tsc', '-p', 'tsconfig.delivery.json', '--outDir', join(stage, 'dist')], repository);
  // Always build fresh assets into the empty staging directory, never copy checkout output.
  run('bun', ['run', 'vite', 'build', 'inspector', '--outDir', join(stage, 'inspector/dist')], repository);
  for (const [source, destination] of [
    ['docs/INSTALL-ARCHIVE.md', 'README.md'], ['docs/ARCHIVE-OPERATION.md', 'docs/operation.md'], ['docs/sdk.md', 'docs/sdk.md'],
    ['docs/doctor.md', 'docs/doctor.md'], ['docs/judge.md', 'docs/judge.md'],
    ['third-party/apus/LICENSE', 'third-party/apus/LICENSE'], ['third-party/apus/NOTICE', 'third-party/apus/NOTICE'],
    ['LICENSE', 'LICENSE'], ['docs/ARCHIVE-NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
    ['inspector/src/fonts/OFL-Kode-Mono.txt', 'inspector/OFL-Kode-Mono.txt'],
    ['node_modules/svelte/LICENSE.md', 'inspector/LICENSE-Svelte.md'],
  ]) {
    await mkdir(dirname(join(stage, destination!)), { recursive: true });
    await cp(join(repository, source!), join(stage, destination!));
    if (source === 'docs/INSTALL-ARCHIVE.md') {
      // This reference becomes the archive root README; relocate its sibling links.
      const guide = await readFile(join(stage, destination!), 'utf8');
      await writeFile(join(stage, destination!), guide.replaceAll('](ARCHIVE-OPERATION.md', '](docs/operation.md')
        .replaceAll('](judge.md', '](docs/judge.md').replaceAll('](doctor.md', '](docs/doctor.md').replaceAll('](sdk.md', '](docs/sdk.md'));
    }
  }
  const source = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
  await writeFile(join(stage, 'package.json'), `${JSON.stringify(deliveryManifest(source), null, 2)}\n`);
  run('npm', ['install', '--package-lock-only', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stage);
  await assertDelivery(stage);
  const archive = join(temporary, 'tenet.tar.gz');
  // Disable macOS AppleDouble synthesis and GNU/bsdtar PAX xattrs, not application files.
  run('tar', ['--no-xattrs', '-czf', archive, '-C', temporary, 'tenet'], temporary);
  // Test the actual tarball, not the staging tree. Publish output only after all checks pass.
  await verifyArchive(archive);
  await mkdir(dirname(output), { recursive: true });
  const pending = `${output}.pending`;
  await cp(archive, pending); await rename(pending, output);
  console.log(`Verified production archive: ${output}`);
} finally { await rm(temporary, { recursive: true, force: true }); }
