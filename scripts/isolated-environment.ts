import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

// Delivery subprocesses never inherit owner settings, credentials or runtime hooks.
export async function isolatedEnvironment(root: string, home: string): Promise<Record<string, string>> {
  assert.ok(isAbsolute(root) && await realpath(root) === root, 'fixture root must be an absolute realpath');
  const child = relative(root, home);
  assert.ok(child && !child.startsWith('..') && !isAbsolute(child), 'fixture home must be inside fixture root');
  assert.equal(await realpath(dirname(home)), dirname(home), 'fixture home parent must exist as a realpath');
  await mkdir(home, { recursive: true, mode: 0o700 });
  assert.equal(await realpath(home), home, 'fixture home must be a realpath, not a symlink');
  const env: Record<string, string> = { PATH: process.env.PATH!, HOME: home, TMPDIR: root, CI: '1',
    XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_DATA_HOME: join(home, '.local/share'),
    PI_CODING_AGENT_DIR: join(home, 'pi'), COPYFILE_DISABLE: '1',
    npm_config_cache: join(home, '.npm'), npm_config_userconfig: join(home, '.npmrc'),
    npm_config_globalconfig: join(home, '.npm-globalrc'), npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_loglevel: 'http' };
  return env;
}

export const isolatedArgs = (file: string, args: string[]) => file === 'bun' ? ['--no-env-file', ...args] : args;
