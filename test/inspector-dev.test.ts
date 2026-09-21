import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startInspectorDev } from '../src/inspector/dev.js';

test('development inspector serves Vite client and proxies archive APIs', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-inspector-dev-')));
  const app = await startInspectorDev({ directory, port: 0 });
  try {
    const html = await (await fetch(app.origin)).text();
    assert.match(html, /\/@vite\/client/);

    const response = await fetch(`${app.origin}api/sessions`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { sessions: unknown[] }).sessions, []);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
