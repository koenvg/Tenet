import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { isolatedEnvironment, isolatedArgs } from './isolated-environment.js';

export type ConsumerContext = Readonly<{ root: string; installation: string; consumer: string }>;
type ConsumerCompiler = Readonly<{ compiler: string; typeRoots: string }>;

type CompilerFailure = { status?: number | null; stdout?: string; stderr?: string };

export class ConsumerInterrupted extends Error {
  readonly exitCode: number;
  constructor(readonly signal: 'SIGINT' | 'SIGTERM') {
    super(`Delivery consumer interrupted by ${signal}.`);
    this.exitCode = signal === 'SIGINT' ? 130 : 143;
  }
}

export class ConsumerShutdownError extends Error {
  constructor(readonly group: number, root: string, cause: Error | undefined,
    readonly interruption: ConsumerInterrupted | undefined, readonly shutdownCause: unknown) {
    super(`Consumer group ${group} did not stop; retained temporary state at ${root}.`,
      { cause: cause ?? interruption ?? shutdownCause });
  }
}

export function runConsumerCompiler(compiler: string, typeRoots: string, cwd: string, env: Record<string, string>): string {
  try {
    return execFileSync('node', [compiler, '--pretty', 'false', '--noEmit', '--strict', '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext', '--target', 'ES2023', '--typeRoots', typeRoots, '--traceResolution', 'check.ts'],
      { cwd, env, encoding: 'utf8', stdio: 'pipe', timeout: 180_000 });
  } catch (error) {
    const failure = error as CompilerFailure;
    const diagnostics = [failure.stdout ?? '', failure.stderr ?? ''].flatMap(output => output.split(/\r?\n/))
      .filter(line => /^(?:.+\(\d+,\d+\): )?error TS\d+: /.test(line)).join('\n');
    const limit = 8_000;
    console.error(`Isolated TypeScript consumer check failed (exit status ${failure.status ?? 'unknown'}).`);
    console.error(diagnostics.slice(0, limit) || 'No TypeScript diagnostics captured.');
    if (diagnostics.length > limit) console.error('[TypeScript diagnostics truncated]');
    throw Object.assign(new Error('Isolated TypeScript consumer compilation failed.'), { status: failure.status });
  }
}

async function runConsumer(runtime: string, fixture: string, context: ConsumerContext): Promise<void> {
  const env = await isolatedEnvironment(context.root, join(context.root, `home-${runtime}-${fixture}`));
  env.PATH = `${join(context.installation, 'node_modules/.bin')}:${env.PATH}`;
  // The outer offline runner must retain state if this owner dies before reporting shutdown.
  await writeFile(join(context.root, '.tenet-consumer-state'), '');
  const child = spawn(runtime, isolatedArgs(runtime, [fixture, context.installation]), {
    cwd: context.consumer, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  });
  let interruption: ConsumerInterrupted | undefined;
  let ownedGroup = child.pid;
  let onInt: (() => void) | undefined, onTerm: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let stdout = '', stderr = '', failure: string | undefined, spawnError: Error | undefined;
      let closed = false, exitCode: number | null = null;
      let shutdown: Promise<void> | undefined;
      let terminationError: unknown;
      const consumerFailure = () => spawnError ?? (failure || (closed && exitCode !== 0 && !(interruption && exitCode === null))
        ? new Error(`${runtime} ${fixture} ${failure ?? `exited ${exitCode}`}.\n${stderr.slice(0, 8_000)}`) : undefined);
      const waitForGroup = async () => {
        if (process.platform === 'win32') { ownedGroup = undefined; return; }
        const deadline = performance.now() + 1_000;
        while (ownedGroup) {
          try { process.kill(-ownedGroup, 0); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') { ownedGroup = undefined; return; }
            if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
          }
          if (performance.now() >= deadline) throw new Error(`Consumer group ${ownedGroup} did not stop.`, { cause: terminationError });
          await sleep(10);
        }
      };
      const terminate = () => {
        if (shutdown) return;
        try {
          if (ownedGroup) {
            if (process.platform === 'win32') child.kill('SIGKILL');
            else process.kill(-ownedGroup, 'SIGKILL');
          }
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') terminationError = error; }
        shutdown = waitForGroup();
        void shutdown.catch(error => {
          clearTimeout(timer);
          child.stdout.destroy(); child.stderr.destroy(); child.unref();
          reject(new ConsumerShutdownError(ownedGroup!, context.root, consumerFailure(), interruption, error));
        });
      };
      const interrupt = (signal: 'SIGINT' | 'SIGTERM') => { interruption ??= new ConsumerInterrupted(signal); terminate(); };
      onInt = () => interrupt('SIGINT'); onTerm = () => interrupt('SIGTERM');
      process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
      const timer = setTimeout(() => { failure = 'timed out'; terminate(); }, 180_000);
      child.stdout.on('data', chunk => {
        stdout += chunk;
        if (stdout.length > 1_000_000) { failure = 'exceeded output limit'; terminate(); }
      });
      child.stderr.on('data', chunk => {
        stderr += chunk;
        if (stderr.length > 1_000_000) { failure = 'exceeded output limit'; terminate(); }
      });
      child.once('error', error => { spawnError = error; terminate(); });
      child.once('close', code => {
        closed = true; exitCode = code;
        clearTimeout(timer);
        // Closing the consumer's pipes does not confirm that its inspector has stopped.
        terminate();
        void shutdown!.then(() => {
          const error = interruption ?? consumerFailure();
          if (error) reject(error);
          else { console.log(stdout.trim()); resolve(); }
        }, () => {});
      });
    });
  } finally {
    if (onInt) process.off('SIGINT', onInt);
    if (onTerm) process.off('SIGTERM', onTerm);
  }
}

export async function verifyRuntimeConsumers(context: ConsumerContext): Promise<void> {
  await cp(new URL('./fixtures/archive-consumer.mjs', import.meta.url), join(context.consumer, 'check.mjs'));
  for (const runtime of ['node', 'bun']) await runConsumer(runtime, 'check.mjs', context);
  for (const name of ['archive-judge.mjs', 'archive-native.mjs', 'archive-offline-trap.mjs'])
    await cp(new URL(`./fixtures/${name}`, import.meta.url), join(context.consumer, name));
  for (const runtime of ['node', 'bun']) await runConsumer(runtime, 'archive-judge.mjs', context);
}

export async function verifyDeclarationConsumer(context: ConsumerContext, compiler: ConsumerCompiler): Promise<void> {
  await cp(new URL('./fixtures/archive-types.ts', import.meta.url), join(context.consumer, 'check.ts'));
  const env = await isolatedEnvironment(context.root, join(context.root, 'home-types'));
  const trace = runConsumerCompiler(compiler.compiler, compiler.typeRoots, context.consumer, env);
  assert.ok(trace.includes(join(context.installation, 'dist/sdk/index.d.ts')), 'consumer must resolve delivered declarations');
  console.log('Isolated TypeScript declarations resolved.');
}
