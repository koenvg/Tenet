import { createHash } from 'node:crypto';
import { findingCategories } from '../decision/finding-triage.js';
import { createServer } from 'node:http';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArchiveIndex } from './archive-index.js';
import { invocationView } from './view.js';

export async function startInspector(options: { directory: string; assets?: string; port?: number; strictPort?: boolean }) {
  const index = new ArchiveIndex(options.directory);
  const assets = new Map<string, { content: Buffer; type: string }>();
  if (options.assets) {
    const files = ['index.html', ...(await readdir(join(options.assets, 'assets'))).filter(f => /^[\w.-]+\.(js|css)$/.test(f)).map(f => `assets/${f}`)];
    for (const name of files) {
      const path = join(options.assets, name), info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new Error('unsafe-asset');
      assets.set(name === 'index.html' ? '/' : `/${name}`, { content: await readFile(path),
        type: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
    }
  }
  const hash = createHash('sha256');
  for (const name of ['server.ts', 'archive-index.ts', 'view.ts']) hash.update(await readFile(new URL(name, import.meta.url)));
  hash.update(await readFile(new URL('../decision/finding-triage.ts', import.meta.url)));
  hash.update(await readFile(new URL('../recording/contract.ts', import.meta.url)));
  hash.update(await readFile(new URL('./finding-view.ts', import.meta.url)));
  for (const [name, asset] of [...assets].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update(asset.content);
  const build = `tenet-reader-0.1.0/${options.assets ? 'assets' : 'dev'}-${hash.digest('hex').slice(0, 12)}`;
  let origin = '';
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const reply = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
    };
    void (async () => {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin !== undefined && req.headers.origin !== origin)) return reply(403, { error: 'access-denied' });
      if (req.method !== 'GET') return reply(405, { error: 'read-only' });
      const url = new URL(req.url ?? '/', origin);
      const asset = assets.get(url.pathname);
      if (asset) { res.writeHead(200, { 'Content-Type': asset.type }); res.end(asset.content); return; }
      const route = /^\/api\/sessions(?:\/([a-f0-9]{64})(?:\/(groups|invocations\/([a-f0-9]{64})))?)?$/.exec(url.pathname);
      if (!route && url.pathname !== '/api/status') return reply(404, { error: 'not-found' });
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 50);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return reply(400, { error: 'invalid-page' });
      const cursor = url.searchParams.get('cursor') ?? undefined, project = url.searchParams.get('project') ?? undefined;
      if ((cursor?.length ?? 0) > 512 || (project?.length ?? 0) > 8192) return reply(400, { error: 'invalid-page' });
      await index.refresh();
      const health = index.captureHealth(route?.[1]);
      const reader = { build, ...index.status() };
      if (url.pathname === '/api/status') return reply(200, { reader });
      const category = url.searchParams.get('category') ?? undefined;
      if (category && (!findingCategories.includes(category as typeof findingCategories[number]) || route?.[2] !== undefined)) return reply(400, { error: 'invalid-category' });
      try {
        if (!route?.[1]) {
          const result = index.sessions({ offset, limit, cursor, project });
          return reply(200, { sessions: result.items, next: result.next, reader, issues: index.issues(), indexing: index.indexing, captureHealth: health });
        }
        if (route[2] === 'groups') return reply(200, { groups: index.uncertaintyGroups(route[1]!), reader, issues: index.issues(route[1]), indexing: index.indexing, captureHealth: health });
        if (!route[3]) {
          const result = index.invocations(route[1]!, { offset, limit, cursor, category: category as typeof findingCategories[number] | undefined });
          return reply(200, { invocations: result.items, next: result.next, reader, issues: index.issues(route[1]), indexing: index.indexing, captureHealth: health });
        }
      } catch { return reply(400, { error: 'invalid-page' }); }
      const detail = await index.detail(route[1]!, route[3]!);
      if (!detail.records.length) return reply(index.indexing ? 503 : 404, { error: index.indexing ? 'indexing-in-progress' : 'not-found' });
      return reply(200, { view: invocationView(detail.records), reader, issues: detail.issues, captureHealth: health });
    })().catch(() => { if (!res.headersSent) reply(503, { error: 'archive-unavailable' }); else res.end(); });
  });
  let port = options.port ?? 0;
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { server.off('error', failed); server.off('listening', ready); };
        const failed = (error: Error) => { cleanup(); reject(error); };
        const ready = () => { cleanup(); resolve(); };
        server.once('error', failed); server.once('listening', ready);
        try { server.listen(port, '127.0.0.1'); } catch (error) { cleanup(); reject(error); }
      });
      break;
    } catch (error) {
      if (options.strictPort !== false || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || port === 0 || port >= 65535 || attempt >= 20) throw error;
      port++;
    }
  }
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no-local-address');
  origin = `http://127.0.0.1:${address.port}`;
  return { origin, url: `${origin}/`,
    close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
