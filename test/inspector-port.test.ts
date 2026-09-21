import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startInspector } from '../src/inspector/server.js';

test('inspector uses its preferred port, with sequential fallback only when requested', async () => {
  const first = await startInspector({ directory: '/unused-test-archive' });
  const port = Number(new URL(first.origin).port);
  let fallback: Awaited<ReturnType<typeof startInspector>> | undefined;
  try {
    await assert.rejects(startInspector({ directory: '/unused-test-archive', port }), { code: 'EADDRINUSE' });
    fallback = await startInspector({ directory: '/unused-test-archive', port, strictPort: false });
    const selected = Number(new URL(fallback.origin).port);
    assert.ok(selected > port && selected <= port + 20);
    await fallback.close(); fallback = undefined;
    await first.close();
    fallback = await startInspector({ directory: '/unused-test-archive', port, strictPort: false });
    assert.equal(Number(new URL(fallback.origin).port), port, 'preferred port is reused when free');
  } finally {
    await fallback?.close();
    // first may already be closed after verifying preferred-port reuse.
    await first.close().catch(() => {});
  }
});
