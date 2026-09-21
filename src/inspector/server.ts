import { createServer } from 'node:http';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readArchive, sessionKey } from '../recording/archive.js';
import { invocationView } from './view.js';

export async function startInspector(options: { directory: string; assets?: string; port?: number }) {
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
      const route = /^\/api\/sessions(?:\/([a-f0-9]{64})(?:\/invocations\/([a-f0-9]{64}))?)?$/.exec(url.pathname);
      if (!route) return reply(404, { error: 'not-found' });
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 50);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return reply(400, { error: 'invalid-page' });
      const archive = await readArchive(options.directory, route[1]);
      const page = <T>(rows: T[]) => ({ items: rows.slice(offset, offset + limit), next: offset + limit < rows.length ? offset + limit : null });
      if (!route[1]) {
        const groups = new Map<string, typeof archive.records>();
        for (const record of archive.records) {
          const id = sessionKey(record.sessionId);
          const rows = groups.get(id) ?? []; rows.push(record); groups.set(id, rows);
        }
        const rows = [...groups].map(([id, records]) => ({ id, sessionId: records[0]!.sessionId,
          projects: [...new Set(records.map(r => r.cwd))], timestamp: Math.max(...records.map(r => r.timestamp)),
          invocations: new Set(records.map(r => r.invocationId)).size,
          coverage: 'best-effort' }));
        const result = page(rows.sort((a, b) => b.timestamp - a.timestamp));
        return reply(200, { sessions: result.items, next: result.next, issues: archive.issues });
      }
      if (!route[2]) {
        const ids = [...new Set(archive.records.map(r => r.invocationId))];
        const result = page(ids.map(id => {
          const records = archive.records.filter(r => r.invocationId === id), first = records[0]!;
          return { id: sessionKey(id), invocationId: id, callId: first.callId, toolName: first.toolName,
            timestamp: first.timestamp, decision: records.find(r => r.stage === 'decision')?.data.decision ?? 'unavailable' };
        }));
        return reply(200, { invocations: result.items, next: result.next, issues: archive.issues });
      }
      const records = archive.records.filter(r => sessionKey(r.invocationId) === route[2]);
      if (!records.length) return reply(404, { error: 'not-found' });
      return reply(200, { view: invocationView(records), issues: archive.issues });
    })().catch(() => { if (!res.headersSent) reply(503, { error: 'archive-unavailable' }); else res.end(); });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no-local-address');
  origin = `http://127.0.0.1:${address.port}`;
  return { origin, url: `${origin}/`,
    close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
