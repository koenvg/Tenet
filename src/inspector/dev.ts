import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { startInspector } from './server.js';

export async function startInspectorDev(options: { directory: string; port?: number }) {
  const api = await startInspector({ directory: options.directory });
  const root = fileURLToPath(new URL('../../inspector', import.meta.url));
  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  try {
    vite = await createViteServer({
      root,
      configFile: fileURLToPath(new URL('../../inspector/vite.config.ts', import.meta.url)),
      server: {
        host: '127.0.0.1',
        port: options.port,
        strictPort: options.port !== undefined && options.port !== 0,
        proxy: { '/api': { target: api.origin, changeOrigin: true } },
      },
    });
    const httpServer = vite.httpServer;
    if (!httpServer) throw new Error('no-local-address');
    if (options.port === 0) {
      // Vite 7 treats zero as its default port. Bind the exposed HTTP server directly.
      const listening = once(httpServer, 'listening');
      httpServer.listen(0, '127.0.0.1');
      await listening;
    } else {
      await vite.listen();
    }
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('no-local-address');
    const origin = `http://127.0.0.1:${address.port}/`;
    return {
      origin,
      url: origin,
      close: async () => { await Promise.all([vite!.close(), api.close()]); },
    };
  } catch (error) {
    await Promise.allSettled([vite?.close(), api.close()]);
    throw error;
  }
}
