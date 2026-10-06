import { constants } from 'node:fs';
import { access, open, realpath, stat } from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';

export const TESTED_PI_VERSION = '0.85.1';
const PI_PACKAGE = '@earendil-works/pi-coding-agent';
// Common compiled readiness entries. The manifest selects the development or production host layout.
export const DELIVERY_FILES = Object.freeze([
  'package.json', 'LICENSE', 'dist/cli/index.js', 'dist/doctor/doctor.js', 'dist/doctor/installation.js',
  'dist/sdk/index.js', 'dist/sdk/index.d.ts', 'dist/runtime/guard.js',
  'dist/runtime/config.js', 'dist/runtime/policy-selection.js', 'dist/runtime/activation.js', 'dist/runtime/resources.js',
  'dist/runtime/settings.js', 'dist/runtime/configuration.js', 'dist/runtime/judge.js',
  'dist/decision/apus.js', 'dist/decision/apus-native.js', 'dist/decision/apus-renderer.js', 'dist/decision/apus-transport.js',
  'dist/decision/assessment-answers.js', 'dist/decision/typesafe-contract.js',
  'docs/judge.md', 'third-party/apus/LICENSE', 'third-party/apus/NOTICE',
  'dist/decision/policy.js', 'dist/decision/jev.js', 'dist/recording/archive.js',
  'inspector/dist/index.html', 'docs/doctor.md',
]);

async function metadata(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 32 * 1024) return;
      const bytes = Buffer.alloc(32 * 1024 + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 32 * 1024) return;
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)));
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } finally { await file.close(); }
  } catch { /* Missing, malformed and unsafe metadata remains unknown. */ }
}

export async function isFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

export async function inspectDelivery(root: string) {
  const missing: string[] = [];
  const pkg = await metadata(join(root, 'package.json'));
  const pi = pkg?.pi as { extensions?: unknown } | undefined;
  const entries = pi?.extensions;
  const checkout = Array.isArray(entries) && entries.length === 1 && entries[0] === './src/pi/extension.ts';
  const archive = Array.isArray(entries) && entries.length === 1 && entries[0] === './dist/pi/extension.js';
  const layout = checkout ? ['bun.lock', 'src/pi/extension.ts', 'src/inspector/serve-cli.ts']
    : archive ? ['package-lock.json', 'dist/pi/extension.js', 'dist/inspector/serve-cli.js'] : [];
  if (!checkout && !archive) missing.push('pi-entry-metadata');
  for (const file of [...DELIVERY_FILES, ...layout]) if (!await isFile(join(root, file))) missing.push(file);
  const dependency = await metadata(join(root, 'node_modules/@typesafe-ai/sdk/package.json'));
  const dependencies = pkg?.dependencies as Record<string, unknown> | undefined;
  if (pkg?.name !== 'tenet' || !dependencies || typeof dependencies['@typesafe-ai/sdk'] !== 'string') missing.push('runtime-dependency-metadata');
  if (dependency?.name !== '@typesafe-ai/sdk' || dependency.version !== dependencies?.['@typesafe-ai/sdk']
    || !await isFile(join(root, 'node_modules/@typesafe-ai/sdk/dist/index.mjs'))) missing.push('installed-typesafe-runtime');
  return { status: missing.length ? 'incomplete' as const : 'complete' as const, missing };
}

export interface Compatibility {
  status: 'tested' | 'unavailable' | 'unknown';
  version: string | null;
  testedVersion: string;
  source: 'path' | 'project' | 'delivery' | 'unknown';
}
// Bounded SemVer, including prerelease and build metadata. Numeric prerelease IDs cannot have leading zeros.
const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function compatibility(pkg: Record<string, unknown> | undefined, source: Compatibility['source']): Compatibility {
  const version = pkg?.name === PI_PACKAGE && typeof pkg.version === 'string'
    && pkg.version.length <= 128 && VERSION.test(pkg.version) ? pkg.version : null;
  return { status: version === null ? 'unknown' : version === TESTED_PI_VERSION ? 'tested' : 'unavailable',
    version, testedVersion: TESTED_PI_VERSION, source };
}

export async function inspectCompatibility(project: string, delivery: string, path: string | undefined): Promise<Compatibility> {
  // Inspect the first Pi launcher on PATH without executing it. An unidentified launcher stays unknown.
  for (const folder of path === undefined ? [] : path.split(delimiter)) {
    const launcher = join(folder || process.cwd(), 'pi');
    if (!await isFile(launcher)) continue;
    try { await access(launcher, constants.X_OK); } catch { continue; }
    try {
      let ancestor = dirname(await realpath(launcher));
      for (let depth = 0; depth < 6; depth++) {
        const pkg = await metadata(join(ancestor, 'package.json'));
        if (pkg?.name === PI_PACKAGE) return compatibility(pkg, 'path');
        const parent = dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
    } catch { /* Do not fall back to a different host for an unidentified launcher. */ }
    return compatibility(undefined, 'path');
  }
  for (const [root, source] of [[project, 'project'], [delivery, 'delivery']] as const) {
    const file = join(root, 'node_modules', PI_PACKAGE, 'package.json');
    if (await isFile(file)) return compatibility(await metadata(file), source);
  }
  return compatibility(undefined, 'unknown');
}
