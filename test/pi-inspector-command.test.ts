import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ArchiveWriter, sessionKey } from '../src/recording/archive.js';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import tenet from '../src/pi/extension.js';
import { launchArc, registerInspectorCommand } from '../src/pi/inspector-command.js';
import { startInspector } from '../src/inspector/server.js';

type Command = { handler: (args: string, ctx: ExtensionContext) => Promise<void> };
function harness(sessionId = 'current-session') {
  const commands = new Map<string, Command>();
  const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<void>>>();
  const notices: string[] = [];
  const pi = {
    on: (name: string, fn: (event: unknown, ctx: ExtensionContext) => Promise<void>) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
    registerCommand: (name: string, command: Command) => commands.set(name, command),
  } as unknown as ExtensionAPI;
  const ctx = { cwd: process.cwd(), hasUI: true, sessionManager: { getSessionId: () => sessionId },
    ui: { notify: (message: string) => notices.push(message), setStatus: () => {} } } as unknown as ExtensionContext;
  const emit = async (name: string, reason = 'quit') => { for (const fn of handlers.get(name) ?? []) await fn({ type: name, reason }, ctx); };
  const invoke = async () => { const command = commands.get('tenet-inspector'); assert.ok(command); await command.handler('', ctx); };
  return { pi, ctx, commands, notices, emit, invoke };
}

test('extension registers inspector command only after an eligible session starts', async () => {
  const h = harness();
  tenet(h.pi);
  assert.equal(h.commands.has('tenet-inspector'), false);
  await h.emit('session_start', 'startup');
  try { assert.ok(h.commands.has('tenet-inspector')); }
  finally { await h.emit('session_shutdown'); }
});

test('command starts a real local reader on demand and repeated calls reuse its listener', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-command-'));
  const h = harness();
  let starts = 0;
  const launches: string[] = [];
  registerInspectorCommand(h.pi, { env: { TENET_RECORDING_DIR: directory }, assets: resolve('inspector/dist'),
    start: async options => { starts++; return startInspector(options); }, openArc: async url => { launches.push(url); } });
  try {
    assert.equal(starts, 0);
    await h.invoke();
    assert.equal(starts, 1);
    const url = launches[0]; assert.ok(url);
    assert.equal(new URL(url).hostname, '127.0.0.1');
    assert.equal((await fetch(new URL('/api/sessions', url))).status, 200);
    await h.invoke();
    assert.equal(starts, 1);
    assert.deepEqual(launches, [url, url]);
    assert.equal(h.notices.filter(message => message.includes(url)).length, 2);
  } finally { await h.emit('session_shutdown'); await rm(directory, { recursive: true, force: true }); }
});

test('deep link hashes the Pi session ID and the API still lists other projects', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-command-link-')));
  const writer = new ArchiveWriter({ enabled: true, directory });
  for (const [sessionId, cwd] of [['current-session', '/one'], ['other-session', '/two']] as const) {
    const sink = writer.bind({ sessionId, invocationId: sessionId, callId: 'read', toolName: 'read', mode: 'observe', cwd });
    sink('begin', {}); sink('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
  }
  await writer.close();
  const h = harness();
  registerInspectorCommand(h.pi, { env: { TENET_RECORDING_DIR: directory }, assets: resolve('inspector/dist'), openArc: async () => {} });
  try {
    await h.invoke();
    const link = new URL(h.notices[0]!.split('TENET inspector: ')[1]!);
    assert.equal(link.searchParams.get('session'), sessionKey('current-session'));
    assert.ok(!link.href.includes('current-session'));
    const index: any = await (await fetch(new URL('/api/sessions', link))).json();
    assert.deepEqual(new Set(index.sessions.map((s: any) => s.sessionId)), new Set(['current-session', 'other-session']));
    assert.equal((await fetch(new URL(`/api/sessions/${sessionKey('current-session')}`, link))).status, 200);
  } finally { await h.emit('session_shutdown'); await rm(directory, { recursive: true, force: true }); }
});

test('shutdown on exit, reload, replacement, resume and fork closes only its Pi-owned listener', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-command-shutdown-'));
  const standalone = await startInspector({ directory });
  try {
    for (const reason of ['quit', 'reload', 'new', 'resume', 'fork']) {
      const h = harness();
      registerInspectorCommand(h.pi, { env: { TENET_RECORDING_DIR: directory }, assets: resolve('inspector/dist'), openArc: async () => {} });
      await h.invoke();
      const url = h.notices[0]?.match(/http:\/\/127\.0\.0\.1:\d+\/\?session=[a-f0-9]{64}/)?.[0];
      assert.ok(url);
      assert.equal((await fetch(url)).status, 200);
      await h.emit('session_shutdown', reason);
      await h.emit('session_shutdown', reason);
      await assert.rejects(fetch(url));
      assert.equal((await fetch(standalone.url)).status, 404, 'independent API server remains listening');
    }
    const resumed = harness('resumed-session');
    registerInspectorCommand(resumed.pi, { env: { TENET_RECORDING_DIR: directory }, assets: resolve('inspector/dist'), openArc: async () => {} });
    await resumed.invoke();
    assert.ok(resumed.notices[0]?.includes('session='));
    await resumed.emit('session_shutdown');
  } finally { await standalone.close(); await rm(directory, { recursive: true, force: true }); }
});

test('shutdown waits for an in-flight start and cannot leave a late listener behind', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-command-race-'));
  const h = harness();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  let origin = '';
  registerInspectorCommand(h.pi, { env: { TENET_RECORDING_DIR: directory }, assets: resolve('inspector/dist'),
    openArc: async () => { throw new Error('should not open Arc after shutdown'); },
    start: async options => { const app = await startInspector(options); origin = app.origin; started(); await gate; return app; } });
  try {
    const invocation = h.invoke();
    await ready;
    const shutdown = h.emit('session_shutdown');
    release();
    await Promise.all([invocation, shutdown]);
    await assert.rejects(fetch(origin + '/api/sessions'));
    assert.ok(!h.notices.some(message => message.includes('TENET inspector: http')));
  } finally { release(); await h.emit('session_shutdown'); await rm(directory, { recursive: true, force: true }); }
});

test('Arc launcher passes the exact URL as a single OS argument and never uses a default browser', async () => {
  const calls: unknown[][] = [];
  const run = async (file: string, args: string[], options: { timeout: number }) => { calls.push([file, args, options]); };
  const url = 'http://127.0.0.1:1000/?session=' + sessionKey('current-session') + '&other=x';
  await launchArc(url, 'darwin', run);
  assert.deepEqual(calls, [['open', ['-a', 'Arc', url], { timeout: 5000 }]]);
  await assert.rejects(launchArc(url, 'linux', run), /macOS/);
  assert.equal(calls.length, 1);
});

test('Arc failure leaves the owner-visible link in Pi and repeated calls never open another browser', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-command-arc-'));
  const h = harness();
  const launches: string[] = [];
  registerInspectorCommand(h.pi, { env: { TENET_RECORDING_DIR: directory }, assets: resolve('inspector/dist'),
    openArc: async url => { launches.push(url); throw new Error('Arc missing'); } });
  try {
    await h.invoke(); await h.invoke();
    assert.equal(launches.length, 2);
    assert.equal(launches[0], launches[1]);
    assert.equal(h.notices.filter(text => text === `TENET inspector: ${launches[0]}`).length, 2);
    assert.equal(h.notices.filter(text => text.includes('Arc could not open')).length, 2);
    assert.equal((await fetch(launches[0]!)).status, 200);
  } finally { await h.emit('session_shutdown'); await rm(directory, { recursive: true, force: true }); }
});

test('missing and invalid assets fail before listening or launching Arc, with a build hint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-command-assets-'));
  const invalid = join(directory, 'invalid');
  await mkdir(join(invalid, 'assets'), { recursive: true });
  await writeFile(join(invalid, 'index.html'), '<html><div id="app"></div></html>');
  try {
    for (const assets of [join(directory, 'missing'), invalid]) {
      const h = harness();
      let starts = 0, launches = 0;
      registerInspectorCommand(h.pi, { env: { TENET_RECORDING_DIR: directory }, assets,
        start: async options => { starts++; return startInspector(options); }, openArc: async () => { launches++; } });
      await h.invoke();
      assert.equal(starts, 0); assert.equal(launches, 0);
      assert.ok(h.notices.some(text => text.includes('bun run inspector:build')));
      assert.ok(!h.notices.some(text => text.startsWith('TENET inspector: http')));
      await h.emit('session_shutdown');
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('built frontend and referenced assets are served from the command listener', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-command-production-'));
  const h = harness();
  registerInspectorCommand(h.pi, { env: { TENET_RECORDING_DIR: directory }, assets: resolve('inspector/dist'), openArc: async () => {} });
  try {
    await h.invoke();
    const url = new URL(h.notices[0]!.split('TENET inspector: ')[1]!);
    const html = await (await fetch(url)).text();
    const js = /src="(\/assets\/[\w.-]+\.js)"/.exec(html)?.[1];
    assert.ok(js);
    assert.equal((await fetch(new URL(js, url))).status, 200);
  } finally { await h.emit('session_shutdown'); await rm(directory, { recursive: true, force: true }); }
});
