import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cp, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const historyFiles = ['fixtures.json', 'report.json', 'report.md'];
async function fixture(run: (f: { root: string; frozen: string; cli: (args: string[]) => ReturnType<typeof spawnSync> }) => Promise<void>) {
  const root = await realpath(await mkdtemp('/tmp/tenet-replay-cli-'));
  const repository = resolve('.'), realHistory = join(repository, 'eval/evidence-selection');
  const before = await Promise.all(historyFiles.map(async name => digest(await readFile(join(realHistory, name)))));
  try {
    const home = join(root, 'home'), project = join(root, 'repository'), frozen = join(project, 'eval/evidence-selection');
    await mkdir(home, { mode: 0o700 }); await mkdir(frozen, { recursive: true });
    for (const name of historyFiles) await cp(join(realHistory, name), join(frozen, name));
    for (const name of ['evidence-selection-replay.ts', 'generic-rule-fixtures.ts']) await cp(join(repository, 'eval', name), join(project, 'eval', name));
    await symlink(join(repository, 'src'), join(project, 'src'));
    await symlink(join(repository, 'node_modules'), join(project, 'node_modules'));
    const preload = join(root, 'no-live.mjs');
    await writeFile(preload, `import assert from 'node:assert/strict'; import { homedir } from 'node:os'; import { realpathSync } from 'node:fs';
assert.equal(homedir(), realpathSync(process.env.HOME));
for (const key of ['TYPESAFE_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','TENET_POLICY','NODE_OPTIONS','NODE_PATH']) assert.equal(process.env[key], undefined);
globalThis.fetch = async () => { throw Error('live requests forbidden'); };\n`);
    const cli = (args: string[]) => spawnSync('bun', ['--no-env-file', '--preload', preload, join(project, 'eval/evidence-selection-replay.ts'), ...args], {
      cwd: project, env: { PATH: process.env.PATH!, HOME: home, TMPDIR: root,
        XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'),
        PI_CODING_AGENT_DIR: join(home, 'pi'), npm_config_userconfig: join(home, 'npmrc'), npm_config_globalconfig: join(home, 'global-npmrc') },
      encoding: 'utf8', timeout: 30000,
    });
    await run({ root, frozen, cli });
  } finally {
    const after = await Promise.all(historyFiles.map(async name => digest(await readFile(join(realHistory, name)))));
    assert.deepEqual(after, before, 'real frozen reports must never be changed, even by a red test');
    await rm(root, { recursive: true, force: true });
  }
}

test('replay CLI refuses omitted output without changing frozen input bytes', () => fixture(async ({ frozen, cli }) => {
  const before = await Promise.all(historyFiles.map(name => readFile(join(frozen, name))));
  const result = cli([]);
  assert.equal(result.error, undefined); assert.equal(result.status, 1, String(result.stderr));
  assert.match(String(result.stderr), /--out/);
  assert.deepEqual(await Promise.all(historyFiles.map(name => readFile(join(frozen, name)))), before);
}));

test('replay CLI creates current JSON and Markdown only in an explicit unused output directory', () => fixture(async ({ root, frozen, cli }) => {
  const before = await Promise.all(historyFiles.map(name => readFile(join(frozen, name))));
  const output = join(root, 'current-replay');
  const result = cli(['--out', output]);
  assert.equal(result.error, undefined); assert.equal(result.status, 0, String(result.stderr));
  const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
  assert.ok(report.pairs.length > 0);
  assert.ok(report.pairs.every((pair: any) => pair.baseline.questionVersion === 'policy-rules-v8-source-set' && pair.candidate.questionVersion === 'policy-rules-v8-source-set'));
  assert.ok((await readFile(join(output, 'report.md'), 'utf8')).includes('Offline'));
  assert.deepEqual(await Promise.all(historyFiles.map(name => readFile(join(frozen, name)))), before);
}));

test('replay CLI refuses frozen destinations, parent aliases and reused output without changing any existing report', () => fixture(async ({ root, frozen, cli }) => {
  const before = await Promise.all(historyFiles.map(name => readFile(join(frozen, name))));
  const alias = join(root, 'history-alias'), broken = join(root, 'broken-output'), hard = join(root, 'hard-linked-report');
  await symlink(frozen, alias); await symlink(join(root, 'absent'), broken); await link(join(frozen, 'report.json'), hard);
  const used = join(root, 'used-output'); await mkdir(used); await writeFile(join(used, 'report.json'), 'existing owner output');
  const refused = [
    ['--out'], ['--out', ''], ['--out', '  '], ['--live'], ['--execute'], ['--out', join(root, 'fresh'), '--live'],
    ...[frozen, join(frozen, 'report.json'), join(frozen, 'report.md'), join(frozen, 'new-output'), alias,
      join(alias, 'new-output'), broken, hard, used].map(path => ['--out', path]),
  ];
  for (const args of refused) {
    const result = cli(args);
    assert.equal(result.error, undefined); assert.equal(result.status, 1, `refusal: ${JSON.stringify(args)}; ${String(result.stderr)}`);
    assert.deepEqual(await Promise.all(historyFiles.map(name => readFile(join(frozen, name)))), before);
  }
  assert.equal(await readFile(join(used, 'report.json'), 'utf8'), 'existing owner output');
  await assert.rejects(realpath(join(frozen, 'new-output')));
  await assert.rejects(realpath(join(root, 'fresh')));
  const output = join(root, 'one-success'); assert.equal(cli(['--out', output]).status, 0);
  const current = await readFile(join(output, 'report.json')); assert.equal(cli(['--out', output]).status, 1);
  assert.deepEqual(await readFile(join(output, 'report.json')), current);
}));
