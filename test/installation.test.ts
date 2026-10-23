import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('frontend notices include the complete Tailwind license', async () => {
  const license = await readFile(new URL('../node_modules/tailwindcss/LICENSE', import.meta.url), 'utf8');
  const notices = await readFile(new URL('../third-party/web/NOTICES.txt', import.meta.url), 'utf8');
  assert.ok(notices.includes(license.trim()), 'frontend attribution must include the complete upstream license');
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

test('checkout rollback prerequisites precede installation replacement', async () => {
  const guide = await readFile(new URL('../docs/INSTALL.md', import.meta.url), 'utf8');
  const rollback = guide.slice(guide.indexOf('For an upgrade or rollback:'));
  const replacement = rollback.indexOf('Prepare a separate stable checkout');
  assert.ok(replacement > 0);
  for (const warning of ['Older releases can ignore automatic global discovery',
    'author and review a complete policy', 'target release\'s override support']) {
    const position = rollback.indexOf(warning);
    assert.ok(position >= 0 && position < replacement, `rollback prerequisite must precede replacement: ${warning}`);
  }
});

test('the operation guide identifies the registered source Pi entry', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const guide = await readFile(new URL('../docs/operation.md', import.meta.url), 'utf8');
  const entry = guide.match(/Pi loads `([^`]+)`/);
  assert.ok(entry, 'the operation guide names the extension Pi loads');
  assert.equal(entry[1], 'src/pi/extension.ts');
  assert.deepEqual(manifest.pi.extensions, [`./${entry[1]}`]);
  assert.ok(guide.includes('The guard uses the same compiled SDK as standalone consumers.'));
});
