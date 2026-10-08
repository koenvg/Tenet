import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startInspectorDev } from '../src/inspector/dev.js';

async function listen(server: Server, port: number) {
  const listening = once(server, 'listening');
  server.listen(port, '127.0.0.1');
  await listening;
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

test('development inspector uses an isolated port with 5173 occupied and releases resources', async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-inspector-dev-')));
  const occupied = createServer((_req, res) => res.end('fixture listener'));
  try {
    // Fail if another server owns 5173. Never stop it or silently skip this regression.
    await listen(occupied, 5173);
    try {
      t.diagnostic('inspector startup begins');
      const app = await startInspectorDev({ directory, port: 0 });
      t.diagnostic('inspector startup complete');
      const port = Number(new URL(app.origin).port);
      try {
        assert.notEqual(port, 5173);
        assert.notEqual(port, 5174, 'port zero must not use Vite\'s sequential fallback');
        const html = await (await fetch(app.origin)).text();
        assert.match(html, /\/@vite\/client/);
        const client = await fetch(`${app.origin}@vite/client`);
        assert.equal(client.status, 200);
        assert.match(await client.text(), /WebSocket/);
        t.diagnostic('Vite HTML and client complete');

        const response = await fetch(`${app.origin}api/sessions`);
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json() as { sessions: unknown[] }).sessions, []);
        t.diagnostic('archive API proxy complete');
      } finally {
        t.diagnostic('inspector teardown begins');
        await app.close();
        t.diagnostic('inspector teardown complete');
      }
      assert.equal(await (await fetch('http://127.0.0.1:5173')).text(), 'fixture listener');
      // Reuse the fixture to prove the Vite port and then 5173 are both released.
      await close(occupied);
      await listen(occupied, port);
      await close(occupied);
      await listen(occupied, 5173);
    } finally {
      if (occupied.listening) await close(occupied);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
