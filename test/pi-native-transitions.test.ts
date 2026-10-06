import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createAgentSession, AgentSessionRuntime, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
  type ExtensionAPI, type ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { registerGuard } from '../src/pi/guard.js';
import { registerInspectorCommand } from '../src/pi/inspector-command.js';
import { startInspector } from '../src/inspector/server.js';
import { isolatedHome } from './isolated-home.js';
import { answer } from './helpers.js';

for (const mode of ['observe', 'enforce'] as const) test(`pinned Pi ${mode}: retained owner commands are inert when dormant; full reload rebuilds the registry`, async () => {
  const cwd = await realpath(await mkdtemp('/tmp/tenet-native-transition-'));
  const homeEnv = await isolatedHome(cwd), file = join(cwd, 'TENET.md');
  const env = { ...homeEnv, TENET_MODE: mode, TENET_RECORDING: 'off', TENET_RECORDING_DIR: join(cwd, 'archive') };
  const oldFetch = globalThis.fetch; globalThis.fetch = async () => { throw Error('no live requests'); };
  const notices: string[] = [], visible = new Map<string, string | undefined>();
  let assessments = 0, starts = 0, launches = 0;
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  let api!: ExtensionAPI;
  try {
    await writeFile(file, 'Rule; Old project fixture.');
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [pi => {
        api = pi;
        registerGuard(pi, { env, controlPath: join(cwd, 'control.json'), judge: async request => { assessments++; return answer(request.policy); },
          onEligible: eligible => registerInspectorCommand(pi, { eligible, env, assets: resolve('inspector/dist'),
            start: async options => { starts++; return startInspector(options); }, openArc: async () => { launches++; } }) });
      }] });
    await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
    const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null,
      modelsStorePath: join(cwd, 'models-store.json'), allowModelNetwork: false, refreshOnCreate: false });
    ({ session } = await createAgentSession({ cwd, agentDir: cwd, modelRuntime, model: modelRuntime.getModels()[0], resourceLoader: loader,
      settingsManager, sessionManager: SessionManager.inMemory(cwd) }));
    const binding = { mode: 'tui' as const, uiContext: {
      notify: (text: string) => notices.push(text), setStatus: (key: string, value?: string) => visible.set(key, value),
      confirm: async () => { throw Error('no approvals expected'); }, select: async () => { throw Error('dormant view must not open'); },
    } as unknown as ExtensionUIContext };
    await session.bindExtensions(binding);
    const services = { cwd, agentDir: cwd, modelRuntime, settingsManager, resourceLoader: loader, diagnostics: [] };
    const runtime = new AgentSessionRuntime(session, services, async options => {
      const result = await createAgentSession({ ...options, modelRuntime, model: modelRuntime.getModels()[0], settingsManager, resourceLoader: loader });
      return { ...result, services: { ...services, cwd: options.cwd }, diagnostics: [] };
    });
    runtime.setRebindSession(async next => { session = next; await next.bindExtensions(binding); });
    const names = () => session!.extensionRunner.getRegisteredCommands().map(c => c.name).filter(name => name.startsWith('tenet')).sort();
    assert.deepEqual(names(), ['tenet', 'tenet-inspector']);
    assert.deepEqual(api.getCommands().filter(c => c.name.startsWith('tenet')).map(c => c.name).sort(), names());
    await unlink(file);
    await session.extensionRunner.emit({ type: 'session_start', reason: 'new' });
    assert.deepEqual(names(), ['tenet', 'tenet-inspector'], 'the pinned registry retains names; this does not test native autocomplete');
    assert.equal(visible.get('tenet'), undefined); assert.equal(visible.get('tenet-recording'), undefined);
    const entries = structuredClone(session.sessionManager.getEntries()), noticesBefore = notices.length;
    const commandContext = session.extensionRunner.createCommandContext();
    for (const args of ['', 'status', 'on', 'off', 'invalid']) await session.extensionRunner.getCommand('tenet')!.handler(args, commandContext);
    await session.extensionRunner.getCommand('tenet-inspector')!.handler('', commandContext);
    assert.equal(notices.length, noticesBefore); assert.equal(starts, 0); assert.equal(launches, 0); assert.equal(assessments, 0);
    assert.deepEqual(session.sessionManager.getEntries(), entries, 'dormant commands add no native entries');
    await writeFile(file, '# current\nRule; Current project fixture.');
    await session.extensionRunner.emit({ type: 'session_start', reason: 'new' });
    await session.extensionRunner.getCommand('tenet')!.handler('status', session.extensionRunner.createCommandContext());
    assert.match(notices.at(-1)!, /ready: 1 rules/);
    await session.extensionRunner.getCommand('tenet-inspector')!.handler('', session.extensionRunner.createCommandContext());
    assert.equal(starts, 1); assert.equal(launches, 1);
    await unlink(file);
    await session.reload();
    assert.deepEqual(names(), [], 'a full native extension reload into a dormant project creates a fresh empty Tenet registry');
    assert.equal(visible.get('tenet'), undefined); assert.equal(visible.get('tenet-recording'), undefined);
    await writeFile(file, 'Rule; Reloaded project fixture.');
    await session.reload();
    assert.deepEqual(names(), ['tenet', 'tenet-inspector']);
    await unlink(file); await runtime.newSession();
    assert.equal(visible.get('tenet'), undefined); assert.equal(visible.get('tenet-recording'), undefined);
    const dormantNotices = notices.length, dormantStarts = starts;
    const dormantContext = session.extensionRunner.createCommandContext();
    await session.extensionRunner.getCommand('tenet')?.handler('status', dormantContext);
    await session.extensionRunner.getCommand('tenet-inspector')?.handler('', dormantContext);
    assert.equal(notices.length, dormantNotices); assert.equal(starts, dormantStarts);
    await writeFile(file, 'Rule; Replacement project fixture.'); await runtime.newSession();
    assert.deepEqual(names(), ['tenet', 'tenet-inspector']);
    await session.extensionRunner.getCommand('tenet')!.handler('status', session.extensionRunner.createCommandContext());
    assert.match(notices.at(-1)!, /ready: 1 rules/);
    await session.extensionRunner.getCommand('tenet-inspector')!.handler('', session.extensionRunner.createCommandContext());
    assert.equal(starts, dormantStarts + 1); assert.equal(launches, 2);
    assert.equal(assessments, 0);
  } finally {
    if (session) { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
    globalThis.fetch = oldFetch; await rm(cwd, { recursive: true, force: true });
  }
});
