import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { assertDelivery, deliveryManifest, runtimeModules, documentFiles } from '../scripts/delivery-contract.js';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

// Compiler reachability is an independent check, never an automatically admitted file list.
test('the reviewed delivery list matches the production TypeScript source graph', () => {
  const repository = fileURLToPath(new URL('..', import.meta.url));
  const configPath = join(repository, 'tsconfig.delivery.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repository);
  assert.deepEqual(parsed.errors, []);
  assert.ok(parsed.options.rootDir, 'delivery compilation must have a source root');
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const modules = program.getSourceFiles().filter(source => !source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source))
    .map(source => relative(parsed.options.rootDir!, source.fileName).replace(/\.ts$/, ''));
  assert.deepEqual([...runtimeModules].sort(), modules.sort(),
    'review source graph changes and explicitly update the closed delivery list');
});

test('shipped frontend notices include the complete Tailwind license', async () => {
  const license = await readFile(new URL('../node_modules/tailwindcss/LICENSE', import.meta.url), 'utf8');
  const notices = await readFile(new URL('../third-party/web/NOTICES.txt', import.meta.url), 'utf8');
  assert.ok(notices.includes(license.trim()), 'frontend attribution must include the complete upstream license');
  const root = await fixture();
  try {
    await rm(join(root, 'inspector/THIRD_PARTY_NOTICES.txt'));
    await assert.rejects(assertDelivery(root), /missing delivery file: inspector\/THIRD_PARTY_NOTICES.txt/);
  } finally { await rm(root, { recursive: true, force: true }); }
  assert.equal(await readFile(new URL('../site/dist/THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8'), notices,
    'the public website must ship the shared frontend notices');
});

test('the BB frontend can resolve Slot from production dependencies', async () => {
  const manifest = JSON.parse(await readFile(new URL('../bb-plugin-tenet-status/package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../bb-plugin-tenet-status/package-lock.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies['@radix-ui/react-slot'], '1.4.0');
  assert.equal(manifest.devDependencies['@radix-ui/react-slot'], undefined);
  assert.equal(lock.packages[''].dependencies['@radix-ui/react-slot'], manifest.dependencies['@radix-ui/react-slot']);
  assert.notEqual(lock.packages['node_modules/@radix-ui/react-slot'].dev, true);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'tenet-delivery-contract-'));
  const manifest = deliveryManifest({ version: '0.1.0', engines: { node: '>=22.12', bun: '>=1.3.14' },
    dependencies: { '@typesafe-ai/sdk': '0.6.0' }, peerDependencies: { '@earendil-works/pi-coding-agent': '1.1.0' } });
  const files = [...runtimeModules.flatMap(name => [`dist/${name}.js`, `dist/${name}.d.ts`]), ...documentFiles,
    'inspector/THIRD_PARTY_NOTICES.txt',
    'inspector/OFL-Kode-Mono.txt', 'inspector/dist/index.html', 'inspector/dist/assets/app-abc123.js', 'inspector/dist/assets/app-abc123.css'];
  for (const file of files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), file.endsWith('index.html')
      ? '<div id="app"></div><script src="/assets/app-abc123.js"></script><link href="/assets/app-abc123.css">' : 'fixture');
  }
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3,
    packages: { '': manifest, 'node_modules/@typesafe-ai/sdk': { version: '0.6.0' } } }));
  return root;
}

test('production contract accepts only the complete curated delivery', async () => {
  const root = await fixture();
  try { await assertDelivery(root); } finally { await rm(root, { recursive: true, force: true }); }
});

for (const path of ['TENET.md', '.env', '.pi/settings.json', '.tenet/records.jsonl', 'test/fixture.json', 'eval/answers.json', 'weights/model.gguf', 'python/openjev.py', '.tenet/config.json',
  'pika-trial.sh', 'scripts/fixtures/apus.json',
  'node_modules/typescript/index.js', 'src/sdk/index.ts', 'dist/sdk/credentials.js', 'inspector/dist/assets/recording.json', 'docs/private.md', 'inspector/dist/assets/credentials-123abc.js']) {
  test(`rejects contaminated delivery: ${path}`, async () => {
    const root = await fixture();
    try {
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), 'private');
      await assert.rejects(assertDelivery(root), /unexpected/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('rejects symlinks and missing declared entries', async () => {
  const root = await fixture();
  try {
    await rm(join(root, 'dist/sdk/index.js')); await symlink('/tmp', join(root, 'dist/sdk/index.js'));
    await assert.rejects(assertDelivery(root), /symlink/);
    await rm(join(root, 'dist/sdk/index.js'));
    await assert.rejects(assertDelivery(root), /missing/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('delivery includes the compiled offline doctor and its reference', async () => {
  assert.ok(runtimeModules.includes('cli/index'));
  assert.ok(runtimeModules.includes('doctor/doctor'));
  assert.ok(runtimeModules.includes('doctor/installation'));
  assert.ok(documentFiles.includes('docs/doctor.md'));
  const root = await fixture();
  try {
    await rm(join(root, 'dist/cli/index.js'));
    await assert.rejects(assertDelivery(root), /missing delivery file: dist\/cli\/index.js/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('delivery includes the configured native judge and its attribution', async () => {
  for (const name of ['decision/apus', 'decision/apus-native', 'decision/apus-renderer', 'decision/apus-transport',
    'decision/assessment-answers', 'decision/typesafe-contract', 'runtime/judge', 'runtime/settings', 'runtime/configuration'])
    assert.ok(runtimeModules.includes(name), `missing reviewed module: ${name}`);
  for (const name of ['docs/judge.md', 'third-party/apus/LICENSE', 'third-party/apus/NOTICE'])
    assert.ok(documentFiles.includes(name), `missing maintained guide or attribution: ${name}`);
  const { DELIVERY_FILES } = await import('../src/doctor/installation.js');
  for (const name of ['dist/decision/apus.js', 'dist/runtime/settings.js', 'docs/judge.md', 'third-party/apus/LICENSE', 'third-party/apus/NOTICE'])
    assert.ok(DELIVERY_FILES.includes(name), `missing readiness entry: ${name}`);
  const root = await fixture();
  try {
    await rm(join(root, 'third-party/apus/NOTICE'));
    await assert.rejects(assertDelivery(root), /missing delivery file: third-party\/apus\/NOTICE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects broken local links in the delivered owner references', async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, 'README.md'), '[Doctor](docs/absent.md)');
    await assert.rejects(assertDelivery(root), /missing documentation target/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('archive rollback prerequisites precede installation replacement', async () => {
  const guide = await readFile(new URL('../docs/INSTALL-ARCHIVE.md', import.meta.url), 'utf8');
  const rollback = guide.slice(guide.indexOf('For an upgrade or rollback:'));
  const replacement = rollback.indexOf('Replace the whole installation');
  assert.ok(replacement > 0);
  for (const warning of ['Older releases can ignore automatic global discovery',
    'author and review a complete policy', 'target release\'s override support']) {
    const position = rollback.indexOf(warning);
    assert.ok(position >= 0 && position < replacement, `rollback prerequisite must precede replacement: ${warning}`);
  }
});

test('rejects missing heading anchors, including same-page links, in shipped guides', async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, 'docs/operation.md'), '# Owner operation\n\n## Select `TENET_POLICY`\n');
    await writeFile(join(root, 'README.md'), '[Selection](docs/operation.md#select-tenet_policy)');
    await assertDelivery(root);
    await writeFile(join(root, 'README.md'), '[Selection](docs/operation.md#absent)');
    await assert.rejects(assertDelivery(root), /missing documentation anchor/);
    await writeFile(join(root, 'README.md'), '[Local](#absent)');
    await assert.rejects(assertDelivery(root), /missing documentation anchor/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('rejects checkout-specific absolute module imports', async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, 'dist/sdk/index.js'), "export * from '/checkout/src/sdk/index.ts';");
    await assert.rejects(assertDelivery(root), /absolute import path/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
for (const change of ['development-script', 'host-dependency', 'lock-mismatch', 'development-lock']) {
  test(`rejects ${change}`, async () => {
    const root = await fixture();
    try {
      const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
      if (change === 'development-script') manifest.scripts.test = 'bun test src';
      if (change === 'host-dependency') manifest.dependencies['@earendil-works/pi-coding-agent'] = '1.1.0';
      if (change === 'lock-mismatch') lock.packages[''].dependencies['@typesafe-ai/sdk'] = '0.5.0';
      if (change === 'development-lock') lock.packages['node_modules/typescript'] = { version: '5.9.3', dev: true };
      await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
      await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock));
      await assert.rejects(assertDelivery(root));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
