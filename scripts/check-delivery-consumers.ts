import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConsumerInterrupted, ConsumerShutdownError, verifyRuntimeConsumers, verifyDeclarationConsumer } from './delivery-consumers.js';
import { isolatedEnvironment, isolatedArgs } from './isolated-environment.js';

const repository = fileURLToPath(new URL('..', import.meta.url));

export async function checkDeliveryConsumers(): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-consumers-')));
  let retained = false;
  try {
    const env = await isolatedEnvironment(root, join(root, 'home-build'));
    env.PATH = `${join(repository, 'node_modules/.bin')}:${env.PATH}`;
    const run = (file: string, args: string[]) => execFileSync(file, isolatedArgs(file, args), {
      cwd: repository, env, stdio: 'inherit', timeout: 180_000,
    });
    const installation = join(root, 'tenet'); await mkdir(installation);
    const compiler = join(repository, 'node_modules/typescript/bin/tsc');
    run('node', [compiler, '-p', 'tsconfig.delivery.json', '--outDir', join(installation, 'dist')]);
    // Bun's no-env-file flag does not disable Vite's separate dotenv loader.
    run('node', ['--input-type=module', '-e', `import { build } from 'vite'; await build({
      root: ${JSON.stringify(join(repository, 'inspector'))}, envDir: false,
      build: { outDir: ${JSON.stringify(join(installation, 'inspector/dist'))} }
    });`]);
    for (const path of ['package.json', 'bun.lock', 'LICENSE', 'docs/judge.md', 'docs/doctor.md',
      'third-party/apus/LICENSE', 'third-party/apus/NOTICE', 'src/pi/extension.ts', 'src/inspector/serve-cli.ts']) {
      await mkdir(dirname(join(installation, path)), { recursive: true });
      await cp(join(repository, path), join(installation, path));
    }
    await symlink(join(repository, 'node_modules'), join(installation, 'node_modules'), 'dir');
    const consumer = join(root, 'consumer'); await mkdir(join(consumer, 'node_modules'), { recursive: true });
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    await symlink(installation, join(consumer, 'node_modules/tenet'), 'dir');
    const context = { root, installation, consumer };
    await verifyRuntimeConsumers(context);
    await verifyDeclarationConsumer(context, { compiler, typeRoots: join(repository, 'node_modules/@types') });
    console.log('Offline delivery consumers passed with checkout dependencies. Production archive verification remains required.');
  } catch (error) {
    retained = error instanceof ConsumerShutdownError;
    throw error;
  } finally { if (!retained) await rm(root, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await checkDeliveryConsumers(); }
  catch (error) {
    if (error instanceof ConsumerShutdownError && error.interruption) {
      console.error(error.message);
      process.exitCode = error.interruption.exitCode;
    } else if (error instanceof ConsumerInterrupted) process.exitCode = error.exitCode;
    else throw error;
  }
}
