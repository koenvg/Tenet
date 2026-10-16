import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

function run(executable, args, env = process.env) {
  const result = spawnSync(executable, args, { encoding: 'utf8', env, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout + result.stderr;
}
const local = file => relative('.', resolve(file));
function vitest(config) {
  const entries = JSON.parse(run(process.execPath, ['node_modules/vitest/vitest.mjs', 'list', '--config', config, '--filesOnly', '--json']));
  return entries.map(entry => local(entry.file));
}
function playwright(config, env) {
  const report = JSON.parse(run(process.execPath, ['node_modules/playwright/cli.js', 'test', '--config', config, '--list', '--reporter=json'], env));
  assert.deepEqual(report.errors, []);
  assert.equal(report.config.workers, 1);
  assert.equal(report.config.projects[0].retries, 0);
  assert.equal(report.config.projects[0].timeout, 20_000);
  return report.suites.map(suite => local(resolve(report.config.rootDir, suite.file)));
}
async function suiteFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await suiteFiles(path));
    else if (/\.(vitest|pw)\.ts$/.test(entry.name)) files.push(path);
  }
  return files;
}

const components = vitest('inspector/vitest.browser.config.ts');
const node = vitest('inspector/vitest.node.config.ts');
const journeys = playwright('inspector/playwright.config.ts');
const child = [];
for (const target of ['integration', 'debugger']) {
  const files = playwright('inspector/tests/diagnostics/child.config.ts', { ...process.env, TENET_DIAGNOSTIC_TARGET: target, TENET_DIAGNOSTIC_CASE: 'success', TENET_DIAGNOSTIC_NAME: 'discovery-child' });
  assert.equal(files.length, 1);
  child.push(...files);
}
for (const lane of [components, node, journeys]) assert.ok(lane.length > 0, 'each ordinary lane must collect tests');
const ordinary = [...components, ...node, ...journeys];
assert.equal(new Set([...ordinary, ...child]).size, ordinary.length + child.length, 'runner discovery must be disjoint and exclude both failure children');
assert.deepEqual([...ordinary, ...child].sort(), (await suiteFiles('inspector/tests')).sort(), 'every Inspector suite must have one owner');
const bun = run('bun', ['test', './inspector/tests', '--pass-with-no-tests']);
assert.match(bun, /did not match any test files/, 'Bun must not collect Inspector runner suites');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const aggregate = pkg.scripts['inspector:test'].split(' && ');
for (const lane of ['components', 'node', 'journeys']) assert.ok(aggregate.includes(`bun run inspector:test:${lane}`), `aggregate omits ${lane}`);
assert.ok(aggregate.includes('bun run inspector:test:discovery'));
console.log(`Inspector discovery passed. ${components.length} component files, ${node.length} Node files, ${journeys.length} journey files; two isolated failure children; no Bun collection.`);
