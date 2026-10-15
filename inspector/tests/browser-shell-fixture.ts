import { test as base, expect } from 'playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const test = base.extend<{ shellOrigin: string; offlineShell: void }, { shellServer: ViteDevServer }>({
  shellServer: [async ({}, use) => {
    const server = await createServer({ configFile: false, envDir: false, root: resolve('bb-plugin-tenet-status'), server: { host: '127.0.0.1', port: 0 } });
    try {
      await server.listen();
      expect((await fetch(`${server.resolvedUrls!.local[0]}live.preview.html`)).status).toBe(200);
      await mkdir('coverage/inspector-artifacts', { recursive: true });
      await use(server);
    } finally { await server.close(); }
  }, { scope: 'worker', timeout: 30_000 }],
  shellOrigin: async ({ shellServer }, use) => { await use(shellServer.resolvedUrls!.local[0]!); },
  offlineShell: [async ({ context, shellOrigin }, use) => {
    const errors: string[] = [], unexpected: string[] = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(shellOrigin).origin && !url.pathname.startsWith('/api/')) return route.continue();
      unexpected.push(`${url.origin}${url.pathname}`);
      return route.abort();
    });
    await use();
    expect(errors).toEqual([]);
    expect(unexpected).toEqual([]);
  }, { auto: true }],
});
export { expect };
