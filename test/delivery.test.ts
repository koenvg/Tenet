import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { assertDelivery, deliveryManifest, runtimeModules, documentFiles } from '../scripts/delivery-contract.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'tenet-delivery-contract-'));
  const manifest = deliveryManifest({ version: '0.1.0', engines: { node: '>=22.12', bun: '>=1.3.14' },
    dependencies: { '@typesafe-ai/sdk': '0.6.0' }, peerDependencies: { '@earendil-works/pi-coding-agent': '0.85.1' } });
  const files = [...runtimeModules.flatMap(name => [`dist/${name}.js`, `dist/${name}.d.ts`]), ...documentFiles,
    'inspector/LICENSE-Svelte.md',
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

for (const path of ['TENET.md', '.env', '.pi/settings.json', '.tenet/records.jsonl', 'test/fixture.json', 'eval/answers.json',
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

test('rejects broken local links in the delivered owner references', async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, 'README.md'), '[Doctor](docs/absent.md)');
    await assert.rejects(assertDelivery(root), /missing documentation target/);
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
      if (change === 'host-dependency') manifest.dependencies['@earendil-works/pi-coding-agent'] = '0.85.1';
      if (change === 'lock-mismatch') lock.packages[''].dependencies['@typesafe-ai/sdk'] = '0.5.0';
      if (change === 'development-lock') lock.packages['node_modules/typescript'] = { version: '5.9.3', dev: true };
      await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
      await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock));
      await assert.rejects(assertDelivery(root));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
