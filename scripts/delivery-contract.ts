import assert from 'node:assert/strict';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';

// A closed list, not a directory copy. New runtime modules require a delivery review.
export const runtimeModules = [
  'sdk/index', 'sdk/types', 'sdk/capabilities',
  'cli/index', 'doctor/doctor', 'doctor/installation',
  ...['apus', 'apus-native', 'apus-renderer', 'apus-transport', 'assessment-answers', 'typesafe-contract', 'assessment-contract', 'assessment-shape', 'contracts', 'decide', 'diagnostics', 'evidence', 'evidence-budget',
    'evidence-context', 'evidence-context-contract', 'filesystem-presence', 'finding-triage', 'history-capture', 'history-content',
    'history-envelope', 'history-groups', 'history-selection', 'immutable', 'jev', 'judge-evidence', 'policy', 'policy-contract', 'policy-origin',
    'questions', 'response-validation', 'thresholds', 'trajectory'].map(n => `decision/${n}`),
  ...['activation', 'approval', 'config', 'configuration', 'judge', 'settings', 'consequences', 'guard', 'invocation-authorization', 'observation-queue', 'owner-record', 'policy-selection', 'resolved-action', 'resources'].map(n => `runtime/${n}`),
  ...['archive', 'contract', 'files', 'judge', 'native', 'policy-contract', 'rules'].map(n => `recording/${n}`),
  ...['approval', 'boundary', 'config', 'extension', 'guard', 'history', 'inspector-command', 'owner-reports', 'report-history'].map(n => `pi/${n}`),
  ...['archive-index', 'assessment-completeness', 'bb-findings', 'bb-summary', 'summary-model', 'summary-explanation', 'finding-view', 'recorded-decision', 'serve-cli', 'server', 'view'].map(n => `inspector/${n}`),
];
export const documentFiles = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/operation.md', 'docs/sdk.md', 'docs/doctor.md', 'docs/judge.md', 'third-party/apus/LICENSE', 'third-party/apus/NOTICE'];

type SourceManifest = {
  version: string; engines: Record<string, string>; dependencies: Record<string, string>; peerDependencies: Record<string, string>;
};
export function deliveryManifest(source: SourceManifest) {
  return { name: 'tenet', version: source.version, private: true, license: 'MIT', type: 'module', engines: source.engines,
    exports: { '.': { types: './dist/sdk/index.d.ts', import: './dist/sdk/index.js' } },
    scripts: { 'inspector:serve': 'node dist/inspector/serve-cli.js' },
    pi: { extensions: ['./dist/pi/extension.js'] },
    dependencies: source.dependencies, peerDependencies: source.peerDependencies,
    peerDependenciesMeta: { '@earendil-works/pi-coding-agent': { optional: true } } };
}

function markdownAnchors(content: string): Set<string> {
  const anchors = new Set<string>(), counts = new Map<string, number>();
  let fence: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1]![0] === fence[0] && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    for (const [, alias] of line.matchAll(/<a\b[^>]*\b(?:id|name)="([^"]+)"/g)) anchors.add(alias!);
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*$/);
    if (!heading) continue;
    const slug = heading[1]!.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<[^>]+>/g, '')
      .replace(/[`*~]/g, '').toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-');
    const count = counts.get(slug) ?? 0; counts.set(slug, count + 1);
    anchors.add(count ? `${slug}-${count}` : slug);
  }
  return anchors;
}

export async function assertDelivery(root: string): Promise<void> {
  const html = await readFile(join(root, 'inspector/dist/index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)="\/(assets\/[\w.-]+\.(?:js|css))"/g)].map(m => m[1]!);
  assert.ok(html.includes('<div id="app">') && references.some(n => n.endsWith('.js')), 'missing built inspector entry');
  const required = new Set([...runtimeModules.flatMap(n => [`dist/${n}.js`, `dist/${n}.d.ts`]), ...documentFiles,
    'package.json', 'package-lock.json', 'inspector/OFL-Kode-Mono.txt', 'inspector/THIRD_PARTY_NOTICES.txt', 'inspector/dist/index.html']);
  for (const name of references) required.add(`inspector/dist/${name}`);
  const found = new Set<string>();
  const allowedDirectory = (name: string) => [...required].some(file => file.startsWith(`${name}/`)) || name === 'inspector/dist/assets';
  async function walk(directory: string, relative = '') {
    for (const entry of await readdir(directory)) {
      const name = relative ? `${relative}/${entry}` : entry;
      const info = await lstat(join(directory, entry));
      assert.ok(!info.isSymbolicLink(), `symlink: ${name}`);
      if (info.isDirectory()) {
        assert.ok(allowedDirectory(name), `unexpected directory: ${name}`);
        await walk(join(directory, entry), name);
      } else {
        assert.ok(info.isFile(), `unexpected file type: ${name}`);
        assert.ok(required.has(name), `unexpected file: ${name}`);
        found.add(name);
      }
    }
  }
  await walk(root);
  for (const file of required) assert.ok(found.has(file), `missing delivery file: ${file}`);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const document of documentFiles.filter(file => file.endsWith('.md'))) {
    const content = await readFile(join(root, document), 'utf8');
    for (const [, target] of content.matchAll(/\]\(([^)]+)\)/g)) {
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const [file, fragment] = target.split('#');
      const path = file ? posix.normalize(posix.join(dirname(document), file)) : document;
      assert.ok(found.has(path), `missing documentation target: ${document} -> ${target}`);
      if (fragment) {
        const linked = await readFile(join(root, path), 'utf8');
        assert.ok(markdownAnchors(linked).has(decodeURIComponent(fragment)), `missing documentation anchor: ${document} -> ${target}`);
      }
    }
  }
  assert.deepEqual(manifest, deliveryManifest(manifest), 'production manifest differs from delivery contract');
  assert.deepEqual(Object.keys(manifest.dependencies), ['@typesafe-ai/sdk'], 'only the evaluator SDK is a runtime dependency');
  assert.deepEqual(Object.keys(manifest.peerDependencies), ['@earendil-works/pi-coding-agent'], 'Pi is an optional host peer only');
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.name, manifest.name); assert.equal(lock.version, manifest.version);
  for (const field of ['name', 'version', 'dependencies', 'peerDependencies', 'peerDependenciesMeta', 'engines'] as const)
    assert.deepEqual(lock.packages[''][field], manifest[field], `lock mismatch: ${field}`);
  assert.equal(lock.packages['node_modules/@typesafe-ai/sdk']?.version, manifest.dependencies['@typesafe-ai/sdk'], 'SDK lock mismatch');
  for (const [name, value] of Object.entries(lock.packages) as [string, { dev?: boolean }][]) {
    assert.ok(!value.dev, `development lock entry: ${name}`);
    assert.ok(!/node_modules\/(?:@earendil-works\/|typescript$|vite$|vitest$|react$|react-dom$|svelte$|playwright$)/.test(name), `development or host lock entry: ${name}`);
  }
  for (const name of references) assert.ok(found.has(`inspector/dist/${name}`), `missing asset: ${name}`);
  for (const module of runtimeModules) {
    const code = await readFile(join(root, `dist/${module}.js`), 'utf8');
    assert.ok(!/(?:from\s*|import\s*\(?\s*)['"](?:file:|\/)/.test(code), `absolute import path: ${module}`);
  }
}
