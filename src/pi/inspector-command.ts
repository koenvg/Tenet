import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { recordingConfig, qualifiedSessionKey } from '../recording/archive.js';
import type { startInspector } from '../inspector/server.js';

const execFileAsync = promisify(execFile);
type Inspector = Awaited<ReturnType<typeof startInspector>>;
type Start = typeof startInspector;

export async function launchArc(url: string, platform = process.platform, run: (file: string, args: string[], options: { timeout: number }) => Promise<unknown> = execFileAsync): Promise<void> {
  if (platform !== 'darwin') throw new Error('Arc can only be launched automatically on macOS');
  await run('open', ['-a', 'Arc', url], { timeout: 5000 });
}

async function checkAssets(assets: string): Promise<void> {
  const html = await readFile(join(assets, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)="(\/assets\/[\w.-]+\.(?:js|css))"/g)].map(match => match[1]!);
  if (!html.includes('<div id="app">') || !references.some(ref => ref.endsWith('.js'))) throw new Error('invalid-inspector-assets');
  for (const ref of references) {
    const file = await lstat(join(assets, ref.slice(1)));
    if (!file.isFile() || file.isSymbolicLink()) throw new Error('invalid-inspector-assets');
  }
}

function notify(ctx: ExtensionContext, message: string, level: 'info' | 'warning' | 'error'): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

export function registerInspectorCommand(pi: ExtensionAPI, options: {
  env?: Record<string, string | undefined>;
  eligible?: (ctx: ExtensionContext) => boolean;
  assets?: string;
  start?: Start;
  openArc?: (url: string) => Promise<void>;
} = {}): void {
  const env = { ...(options.env ?? process.env) };
  const eligible = (ctx: ExtensionContext) => options.eligible?.(ctx) ?? true;
  const assets = options.assets ?? fileURLToPath(new URL('../../inspector/dist', import.meta.url));
  let starting: Promise<Inspector> | undefined;
  let shuttingDown: Promise<void> | undefined;
  let closed = false;

  pi.registerCommand('tenet-inspector', {
    description: 'Open the local TENET inspector at this session in Arc',
    handler: async (_args, ctx) => {
      if (!eligible(ctx)) return;
      if (closed) { notify(ctx, 'TENET inspector unavailable: Pi session is closing.', 'warning'); return; }
      try {
        if (!starting) {
          starting = (async () => {
            const config = recordingConfig(env);
            if (config.issue) throw new Error(config.issue);
            await checkAssets(assets);
            if (!eligible(ctx)) throw new Error('Session eligibility changed during inspector startup');
            const start = options.start ?? (await import('../inspector/server.js')).startInspector;
            if (!eligible(ctx)) throw new Error('Session eligibility changed during inspector startup');
            const app = await start({ directory: config.directory, assets });
            if (closed || !eligible(ctx)) { await app.close(); throw new Error('Pi session closed during inspector startup'); }
            return app;
          })();
        }
        const app = await starting;
        if (closed || !eligible(ctx)) return;
        const url = new URL(app.url);
        url.searchParams.set('session', qualifiedSessionKey('pi', ctx.sessionManager.getSessionId(), 'main'));
        notify(ctx, `TENET inspector: ${url}`, 'info');
        try { await (options.openArc ?? launchArc)(url.toString()); }
        catch { if (!closed && eligible(ctx)) notify(ctx, `Arc could not open. Use the TENET inspector URL above: ${url}`, 'warning'); }
      } catch (error) {
        starting = undefined;
        if (!eligible(ctx)) return;
        const cause = error as NodeJS.ErrnoException;
        const hint = cause.code === 'ENOENT' || ['unsafe-asset', 'invalid-inspector-assets'].includes(cause.message) ? ' Run bun run inspector:build first.' : '';
        notify(ctx, `TENET inspector could not start: ${cause.message}.${hint}`, 'error');
      }
    },
  });

  pi.on('session_shutdown', async () => {
    closed = true;
    shuttingDown ??= (async () => {
      if (!starting) return;
      const app = await starting.catch(() => undefined);
      if (app) await app.close();
    })();
    await shuttingDown;
  });

  pi.on('session_start', async () => {
    if (!closed) return;
    await shuttingDown;
    starting = undefined;
    shuttingDown = undefined;
    closed = false;
  });
}
