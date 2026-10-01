import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { readArchive } from '../src/recording/archive.js';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
  type ExtensionAPI, type ExtensionContext, type ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, InMemoryCredentialStore, type AssistantMessage, type ToolCall } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { registerGuard } from '../src/pi/guard.js';
import { createGuard } from 'tenet';
import { argumentDigest } from '../src/decision/evidence.js';
import { RULE, INTEGRITY_ID } from '../src/decision/policy.js';
import type { Action, Outcome } from '../src/decision/contracts.js';
import { answer, ruleAnswer } from './helpers.js';
import { recoverObservations, EVIDENCE_DEFAULTS } from '../src/decision/trajectory.js';

// Real Pi loader -> AgentSession hooks -> ExtensionRunner -> agent-core -> dummy executor.
// Both model streaming and Jev are scripted. Any accidental HTTP request fails this test.
test('pinned Pi dispatch gates built-in, extension and dynamically registered tool calls', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tenet-smoke-'));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network forbidden in offline smoke'); };
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  try {
    await writeFile(join(cwd, 'TENET.md'), `Rule; ${RULE}\nRule; Ask before installing dependencies.`);
    await writeFile(join(cwd, 'local.txt'), 'offline local file');
    let outcome: Outcome = 'PASS';
    let integrity: Outcome = 'PASS';
    let judgeFailure = false;
    let executorFailure = false;
    let approved = false;
    let confirmations = 0;
    let pendingConfirmation: (() => Promise<boolean>) | undefined;
    let extensionAPI!: ExtensionAPI;
    const assessed: Action[] = [];
    const executed: unknown[] = [];
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const nativeInputs = new Map<string, Record<string, unknown>>();
    const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [pi => {
        // Supported ordering: an earlier extension finishes argument mutation first.
        pi.on('tool_call', event => {
          nativeInputs.set(event.toolCallId, event.input);
          const payload = (event.input as Record<string, unknown>).payload as Record<string, unknown> | undefined;
          if (payload?.mutateBeforeAssessment) payload.value = 'assessed-after-hook';
        });
      }, pi => {
        extensionAPI = pi;
        pi.registerTool({ name: 'dummy', label: 'Dummy', description: 'Offline dummy with arbitrary payload',
          parameters: Type.Object({ payload: Type.Unknown() }),
          async execute(id, args) {
            assert.equal(argumentDigest(args), assessed.find(action => action.callId === id)?.argumentDigest);
            executed.push(structuredClone(args));
            if (executorFailure) throw new Error('dummy executor failed');
            return { content: [{ type: 'text', text: 'done' }], details: {} };
          } });
        registerGuard(pi, { env: { TENET_RECORDING: 'off', TENET_MODE: 'enforce' }, judge: async request => {
          assessed.push(request.action);
          if (judgeFailure) throw new Error('scripted provider failure');
          const raw = answer(request.policy, outcome);
          raw.rules[raw.rules.length - 1] = ruleAnswer(INTEGRITY_ID, integrity);
          return raw;
        } });
      }],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(),
      modelsPath: null, modelsStorePath: join(cwd, 'models-store.json'), allowModelNetwork: false, refreshOnCreate: false });
    const model = modelRuntime.getModels()[0];
    assert.ok(model, 'static model available without credentials');
    ({ session } = await createAgentSession({ cwd, agentDir: cwd, modelRuntime, model,
      resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(cwd) }));
    await session.bindExtensions({ mode: 'tui', uiContext: {
      notify() {}, setStatus() {},
      async confirm(title: string, body: string) {
        confirmations++;
        assert.match(title, /TENET/);
        assert.ok(body.includes(RULE));
        assert.ok(body.includes('Ask before installing dependencies.'));
        assert.ok(!body.includes('hidden-credential'));
        return pendingConfirmation ? pendingConfirmation() : approved;
      },
    } as unknown as ExtensionUIContext });
    let pendingCalls: ToolCall[] = [];
    session.agent.streamFunction = () => {
      const stream = createAssistantMessageEventStream();
      const calls = pendingCalls; pendingCalls = [];
      const message: AssistantMessage = { role: 'assistant', content: calls.length ? calls : [{ type: 'text', text: 'done' }],
        api: model.api, provider: model.provider, model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: calls.length ? 'toolUse' : 'stop', timestamp: Date.now() };
      stream.push({ type: 'done', reason: message.stopReason as 'toolUse' | 'stop', message });
      stream.end(message);
      return stream;
    };
    let serial = 0;
    const invokeMany = async (calls: { name: string; args: Record<string, unknown> }[]) => {
      pendingCalls = calls.map(({ name, args }) => ({ type: 'toolCall', id: `smoke-${++serial}`, name, arguments: args }));
      await session!.agent.prompt('scripted offline call');
    };
    const invoke = (name: string, args: Record<string, unknown>) => invokeMany([{ name, args }]);
    const args = { payload: { code: 'hello', Authorization: 'hidden-credential' } };
    await invoke('dummy', args);
    assert.equal(executed.length, 1);
    assert.deepEqual(executed[0], args);
    assert.equal(confirmations, 0);
    assert.ok(!JSON.stringify(assessed).includes('hidden-credential'));

    outcome = 'APPROVAL_REQUIRED';
    await invoke('dummy', args);
    assert.equal(executed.length, 1, 'denied publication never executes');
    approved = true;
    let release!: (value: boolean) => void;
    let shown!: () => void;
    const shownPromise = new Promise<void>(resolve => { shown = resolve; });
    pendingConfirmation = () => { shown(); return new Promise(resolve => { release = resolve; }); };
    const pending = invoke('dummy', args);
    await shownPromise;
    assert.equal(executed.length, 1, 'executor stays pending until the native confirmation resolves');
    release(true);
    await pending;
    pendingConfirmation = undefined;
    assert.equal(executed.length, 2, 'positive approval executes once');
    assert.equal(confirmations, 2);

    judgeFailure = true;
    await invoke('dummy', args);
    assert.equal(executed.length, 2, 'provider failure never executes');
    judgeFailure = false;
    outcome = 'UNKNOWN';
    await invoke('dummy', args);
    assert.equal(executed.length, 2, 'unknown is blocked without approval');

    outcome = 'PASS'; executorFailure = true;
    await invoke('dummy', args);
    executorFailure = false;
    assert.equal(executed.length, 3);

    extensionAPI.registerTool({ name: 'brand_new_shape', label: 'New', description: 'Dynamically registered offline dummy',
      parameters: Type.Object({ rows: Type.Array(Type.Number()) }),
      async execute(_id, finalArgs) {
        assert.deepEqual(finalArgs, { rows: [1, 2, 3] });
        assert.equal(argumentDigest(finalArgs), assessed.at(-1)?.argumentDigest);
        executed.push(finalArgs);
        return { content: [{ type: 'text', text: 'new tool done' }], details: {} };
      } });
    await invoke('brand_new_shape', { rows: [1, 2, 3] });
    assert.equal(executed.length, 4);
    assert.equal(assessed.at(-1)?.description, 'Dynamically registered offline dummy');
    assert.ok(assessed.at(-1)?.parameters);
    await invoke('read', { path: 'local.txt' });
    assert.equal(assessed.at(-1)?.toolName, 'read');
    assert.ok(assessed.at(-1)?.description);
    outcome = 'APPROVAL_REQUIRED'; approved = false;
    await invoke('brand_new_shape', { rows: [1, 2, 3] });
    assert.equal(executed.length, 4, 'newly registered publication also waits for approval');
    approved = true;
    await invoke('brand_new_shape', { rows: [1, 2, 3] });
    assert.equal(executed.length, 5);
    assert.equal(confirmations, 4);
    integrity = 'FAIL';
    await invoke('dummy', { payload: { command: 'echo done; rm TENET.md' } });
    assert.equal(executed.length, 5, 'integrity block cannot be approved');
    integrity = 'UNKNOWN';
    await invoke('brand_new_shape', { rows: [1, 2, 3] });
    assert.equal(executed.length, 5, 'uncertain integrity never executes');
    assert.equal(confirmations, 4);
    const records = session.sessionManager.getEntries().flatMap(e => e.type === 'custom' && e.customType === 'tenet' ? [e.data as any] : []);
    assert.ok(records.some(r => r.stage === 'execution' && r.outcome === 'unknown'));
    for (const callId of ['smoke-1', 'smoke-3', 'smoke-7', 'smoke-8', 'smoke-10']) {
      assert.ok(records.some(r => r.stage === 'execution' && r.callId === callId && r.outcome === 'unknown'));
    }
    assert.ok(records.some(r => r.stage === 'execution' && r.callId === 'smoke-6' && r.outcome === 'unknown'));
    assert.ok(records.some(r => r.stage === 'execution' && r.outcome === 'unknown'));
    assert.ok(!records.some(r => r.stage === 'execution' && ['smoke-2', 'smoke-4', 'smoke-5', 'smoke-9'].includes(r.callId)));
    assert.ok(records.some(r => r.stage === 'status' && r.ruleCount === 2 && r.questionVersion === 'policy-rules-v6-applicability'));
    for (const callId of ['smoke-11', 'smoke-12']) {
      assert.ok(records.some(r => r.stage === 'permission' && r.callId === callId && r.outcome === 'blocked'));
      assert.ok(!records.some(r => r.stage === 'execution' && r.callId === callId));
    }
    assert.ok(!JSON.stringify(records).includes('hidden-credential'));

    integrity = 'PASS'; outcome = 'APPROVAL_REQUIRED'; approved = true;
    await invoke('dummy', { payload: { mutateBeforeAssessment: true, value: 'unassessed' } });
    const expected = { payload: { mutateBeforeAssessment: true, value: 'assessed-after-hook' } };
    assert.deepEqual(assessed.at(-1)?.arguments, expected, 'TENET sees the preceding extension mutation');
    assert.deepEqual(executed.at(-1), expected, 'executor gets exactly the assessed post-hook arguments');
    assert.equal(executed.length, 6);
    assert.equal(confirmations, 5);

    const until = async (predicate: () => boolean) => {
      const deadline = Date.now() + 3000;
      while (!predicate()) {
        assert.ok(Date.now() < deadline, `pinned host checkpoint timed out: serial=${serial} assessed=${assessed.length} replies=${replies.length} executed=${executed.length} confirmations=${confirmations}`);
        await new Promise(resolve => setTimeout(resolve, 2));
      }
    };
    let replies: ((value: boolean) => void)[] = [];
    pendingConfirmation = () => new Promise(resolve => { replies.push(resolve); });
    const changed = invoke('dummy', { payload: { value: 'before-approval' } });
    await until(() => replies.length === 1);
    (nativeInputs.get(`smoke-${serial}`)!.payload as Record<string, unknown>).value = 'after-approval';
    replies[0]!(true); await changed;
    assert.equal(executed.length, 6, 'changed arguments stay withheld after positive native consent');

    pendingConfirmation = undefined; approved = false;
    await invoke('dummy', { payload: { value: 'before-approval' } });
    assert.equal(executed.length, 6, 'retry requires fresh consent');
    approved = true;
    await invoke('dummy', { payload: { value: 'before-approval' } });
    assert.equal(executed.length, 7);
    assert.deepEqual(executed.at(-1), { payload: { value: 'before-approval' } });

    replies = []; session.agent.toolExecution = 'parallel';
    pendingConfirmation = () => new Promise(resolve => { replies.push(resolve); });
    const beforeConcurrent = assessed.length;
    // Pi 0.85.1 prepares calls serially even in parallel executor mode. Exercise
    // overlapping native hooks directly, then dispatch through its loaded dummy tool.
    const nativeInvoke = async (args: Record<string, unknown>) => {
      const id = `smoke-${++serial}`;
      const veto = await session!.extensionRunner.emitToolCall({ type: 'tool_call', toolCallId: id, toolName: 'dummy', input: args });
      if (!veto?.block) await session!.agent.state.tools.find(tool => tool.name === 'dummy')!.execute(id, args, new AbortController().signal);
    };
    const concurrent = Promise.all([nativeInvoke({ payload: { value: 'one' } }), nativeInvoke({ payload: { value: 'two' } })]);
    await until(() => assessed.length === beforeConcurrent + 2 && replies.length === 1);
    assert.equal(executed.length, 7, 'both executors withheld while native dialogs serialize');
    replies[0]!(true);
    await until(() => replies.length === 2 && executed.length === 8);
    assert.equal(executed.length, 8);
    assert.deepEqual(executed.at(-1), { payload: { value: 'one' } });
    replies[1]!(false); await concurrent;
    assert.equal(executed.length, 8, 'denied concurrent call never executes');

    replies = [];
    const cancelled = invoke('dummy', { payload: { value: 'cancelled' } });
    await until(() => replies.length === 1);
    await session.abort(); replies[0]!(true); await cancelled;
    assert.equal(executed.length, 8, 'late consent cannot release cancelled native work');

    const transitions = [
      () => session!.extensionRunner.emit({ type: 'session_before_switch', reason: 'new' }),
      () => session!.extensionRunner.emit({ type: 'session_before_fork', entryId: 'offline', position: 'at' }),
      () => session!.extensionRunner.emit({ type: 'session_tree', oldLeafId: null, newLeafId: null }),
      () => session!.extensionRunner.emit({ type: 'session_start', reason: 'reload' }),
      () => session!.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }),
    ];
    for (const transition of transitions) {
      replies = [];
      const invalidated = invoke('dummy', { payload: { value: 'lifecycle' } });
      await until(() => replies.length === 1);
      await transition(); replies[0]!(true); await invalidated;
      assert.equal(executed.length, 8, 'native lifecycle revokes pending executor permission');
      await session.extensionRunner.emit({ type: 'session_start', reason: 'reload' });
    }
    pendingConfirmation = undefined;
    await invoke('dummy', { payload: { value: 'after-restart' } });
    assert.equal(executed.length, 9, 'fresh SDK session remains usable after shutdown and restart');
    assert.deepEqual(executed.at(-1), { payload: { value: 'after-restart' } });
  } finally {
    session?.dispose();
    globalThis.fetch = realFetch;
    await rm(cwd, { recursive: true, force: true });
  }
});
test('pinned Pi sessions stay silent without a policy, then expose TENET with one in both modes', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network forbidden in offline smoke'); };
  try {
    for (const mode of ['observe', 'enforce'] as const) for (const state of ['dormant', 'on', 'off']) {
      const active = state !== 'dormant', off = state === 'off';
      const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tenet-eligibility-smoke-')));
      let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
      try {
        await writeFile(join(cwd, 'local.txt'), 'offline local file');
        if (active) await writeFile(join(cwd, 'TENET.md'), 'Rule; Never publish without approval.');
        if (off) {
          const control = createGuard({ host: 'offline-control', env: { TENET_RECORDING: 'off' }, controlPath: join(cwd, 'control.json') });
          await control.setActivation('off'); await control.close();
        }
        let pi!: ExtensionAPI; let assessments = 0;
        const statuses: string[] = [], notices: string[] = [];
        const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
        const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, settingsManager,
          noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
          extensionFactories: [api => { pi = api; registerGuard(api, { env: { TENET_MODE: mode, TENET_RECORDING: 'off' },
            controlPath: join(cwd, 'control.json'), judge: async request => { assessments++; return answer(request.policy); } }); }],
        });
        await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
        const credentials = new InMemoryCredentialStore();
        await credentials.modify('openai', async () => ({ type: 'api_key', key: 'offline-not-a-real-key' }));
        const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null,
          modelsStorePath: join(cwd, 'models-store.json'), allowModelNetwork: false, refreshOnCreate: false });
        const model = modelRuntime.getModels().find(candidate => candidate.provider === 'openai')!;
        ({ session } = await createAgentSession({ cwd, agentDir: cwd, modelRuntime, model,
          resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(cwd) }));
        await session.bindExtensions({ mode: 'tui', uiContext: {
          notify: (text: string) => { notices.push(text); }, setStatus: (_key: string, value: string) => { statuses.push(value); },
        } as unknown as ExtensionUIContext });
        assert.equal(pi.getCommands().some(command => command.name === 'tenet'), active);
        let pending: ToolCall | undefined = { type: 'toolCall', id: 'policy-check', name: 'read', arguments: { path: 'local.txt' } };
        session.agent.streamFunction = () => {
          const stream = createAssistantMessageEventStream();
          const call = pending; pending = undefined;
          const message: AssistantMessage = { role: 'assistant', content: call ? [call] : [{ type: 'text', text: 'done' }],
            api: model.api, provider: model.provider, model: model.id,
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: call ? 'toolUse' : 'stop', timestamp: Date.now() };
          stream.push({ type: 'done', reason: message.stopReason as 'toolUse' | 'stop', message });
          stream.end(message); return stream;
        };
        await session.prompt('Read the local file.');
        const records = session.sessionManager.getEntries().filter(entry => entry.type === 'custom' && entry.customType === 'tenet');
        assert.equal(records.length > 0, active && !off, `${mode} state=${state}`);
        assert.equal(assessments, active && !off ? 1 : 0);
        assert.equal(statuses.some(value => value.includes('TENET ON')), active && !off);
        assert.equal(statuses.some(value => value.includes('TENET OFF')), off);
        assert.equal(notices.length > 0, active && !off);
        assert.ok(JSON.stringify(session.sessionManager.getEntries()).includes('offline local file'));
      } finally { session?.dispose(); await rm(cwd, { recursive: true, force: true }); }
    }
  } finally { globalThis.fetch = realFetch; }
});


test('production extension entry loads with pinned Pi and missing credentials remains fail-closed', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tenet-entry-'));
  const previousRecording = process.env.TENET_RECORDING;
  const previousDirectory = process.env.TENET_RECORDING_DIR;
  delete process.env.TENET_RECORDING;
  process.env.TENET_RECORDING_DIR = join(await realpath(cwd), 'archive');
  const previousKey = process.env.TYPESAFE_API_KEY;
  const previousMode = process.env.TENET_MODE;
  process.env.TENET_MODE = 'enforce';
  process.env.TYPESAFE_API_KEY = '';
  try {
    await writeFile(join(cwd, 'TENET.md'), `Rule; ${RULE}`);
    const loader = new DefaultResourceLoader({ cwd, agentDir: cwd,
      settingsManager: SettingsManager.inMemory(), noExtensions: true, noSkills: true,
      noPromptTemplates: true, noThemes: true, noContextFiles: true,
      additionalExtensionPaths: [resolve('src/pi/extension.ts')] });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const extensions = loader.getExtensions().extensions;
    assert.equal(extensions.length, 1);
    assert.ok(extensions[0]?.handlers.has('tool_call'));
    const records: any[] = [];
    loader.getExtensions().runtime.appendEntry = (_type, data) => { records.push(data); };
    const ctx = { cwd, hasUI: false, sessionManager: { getSessionId: () => 'production-entry' } } as ExtensionContext;
    for (const handler of extensions[0]!.handlers.get('session_start')!) await handler({ type: 'session_start', reason: 'startup' }, ctx);
    assert.ok(records.some(r => r.stage === 'status' && r.reason === 'missing-credentials'));
    assert.ok(records.some(r => r.stage === 'status' && r.questionVersion === 'policy-rules-v6-applicability' && r.ruleCount === 1));
    const [handler] = extensions[0]!.handlers.get('tool_call')!;
    const result = await handler!({ type: 'tool_call', toolName: 'unfamiliar', toolCallId: 'missing-key', input: {} }, ctx);
    assert.ok(result && typeof result === 'object' && 'block' in result && 'reason' in result);
    assert.equal(result.block, true);
    assert.match(String(result.reason), /missing-credentials/);
    for (const shutdown of extensions[0]!.handlers.get('session_shutdown')!) await shutdown({ type: 'session_shutdown' }, ctx);
    const archive = await readArchive(process.env.TENET_RECORDING_DIR!);
    assert.ok(archive.records.some(r => r.stage === 'permission' && r.data.requestStatus === 'not-submitted'));
    assert.ok(!archive.records.some(r => r.stage === 'request'));
  } finally {
    if (previousRecording === undefined) delete process.env.TENET_RECORDING;
    else process.env.TENET_RECORDING = previousRecording;
    if (previousDirectory === undefined) delete process.env.TENET_RECORDING_DIR;
    else process.env.TENET_RECORDING_DIR = previousDirectory;
    if (previousMode === undefined) delete process.env.TENET_MODE;
    else process.env.TENET_MODE = previousMode;
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    await rm(cwd, { recursive: true, force: true });
  }
});

test('pinned Pi observation executes concerns without delivering reports to model context or stdout', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tenet-observe-smoke-'));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network forbidden'); };
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  const stdout = process.stdout.write; const output: string[] = [];
  try {
    await writeFile(join(cwd, 'TENET.md'), `Rule; BLOCK; ${RULE}`);
    let finishFirst!: () => void;
    const firstJudge = new Promise<void>(resolve => { finishFirst = resolve; });
    const requests: string[] = []; let executed = 0, scenario = 'FAIL';
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [pi => {
        pi.registerTool({ name: 'observation_dummy', label: 'Dummy', description: 'Offline dummy', parameters: Type.Object({ value: Type.String() }),
          async execute() { executed++; return { content: [{ type: 'text', text: 'ordinary-tool-result' }], details: {} }; } });
        registerGuard(pi, { env: { TENET_RECORDING: 'off' }, judge: async request => {
          const selected = request.action.callId.replace('observe-', '');
          if (selected === 'FAIL') await firstJudge;
          if (selected === 'provider') throw new Error('provider-private-prose');
          const raw = answer(request.policy, selected === 'ASK' ? 'APPROVAL_REQUIRED' : 'FAIL');
          if (selected === 'integrity') raw.rules[raw.rules.length - 1] = ruleAnswer(INTEGRITY_ID, 'FAIL');
          return { ...raw, explanation: 'unsolicited-secret-prose' };
        } });
      }],
    });
    await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
    const credentials = new InMemoryCredentialStore();
    await credentials.modify('openai', async () => ({ type: 'api_key', key: 'offline-not-a-real-key' }));
    const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null,
      modelsStorePath: join(cwd, 'models-store.json'), allowModelNetwork: false, refreshOnCreate: false });
    const model = modelRuntime.getModels().find(m => m.provider === 'openai')!;
    ({ session } = await createAgentSession({ cwd, agentDir: cwd, modelRuntime, model, resourceLoader: loader, settingsManager,
      sessionManager: SessionManager.create(cwd, join(cwd, 'sessions')) }));
    await session.bindExtensions({ mode: 'json' });
    let call: ToolCall | undefined;
    session.agent.streamFunction = (_model, context) => {
      requests.push(JSON.stringify(context));
      const stream = createAssistantMessageEventStream();
      const pending = call; call = undefined;
      const message: AssistantMessage = { role: 'assistant', content: pending ? [pending] : [{ type: 'text', text: 'finished' }],
        api: model.api, provider: model.provider, model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: pending ? 'toolUse' : 'stop', timestamp: Date.now() };
      stream.push({ type: 'done', reason: message.stopReason as 'toolUse' | 'stop', message }); stream.end(message); return stream;
    };
    process.stdout.write = ((chunk: unknown) => { output.push(String(chunk)); return true; }) as typeof process.stdout.write;
    for (const value of ['FAIL', 'ASK', 'integrity', 'provider']) {
      scenario = value;
      call = { type: 'toolCall', id: `observe-${value}`, name: 'observation_dummy', arguments: { value: 'safe' } };
      await session.prompt('Run the offline dummy.');
      if (value === 'FAIL') {
        assert.equal(executed, 1, 'observation executes before its stalled judge finishes');
        assert.ok(!session.sessionManager.getEntries().some(e => e.type === 'custom' && e.customType === 'tenet' && (e.data as any).stage === 'decision'));
        finishFirst();
      }
    }
    assert.equal(executed, 4);
    for (let i = 0; i < 400; i++) {
      const stages = session.sessionManager.getEntries().flatMap(e => e.type === 'custom' && e.customType === 'tenet' ? [e.data as any] : []);
      if (stages.filter(r => r.stage === 'assessment-status' && r.status !== 'pending').length === 4) break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    const records = session.sessionManager.getEntries().flatMap(e => e.type === 'custom' && e.customType === 'tenet' ? [e.data as any] : []);
    assert.equal(records.filter(r => r.stage === 'permission' && r.mode === 'observe' && r.outcome === 'released').length, 4);
    assert.equal(records.filter(r => r.stage === 'approval').length, 0);
    assert.ok(records.some(r => r.stage === 'decision' && r.decision === 'ASK'));
    assert.ok(records.every(r => r.stage !== 'permission' || r.wouldDecision === undefined));
    assert.ok(records.some(r => r.stage === 'permission' && !r.assessmentAvailable));
    assert.ok(!JSON.stringify(records).includes('private-prose'));
    assert.ok(!JSON.stringify(records).includes('unsolicited-secret-prose'));
    for (const request of requests) {
      assert.ok(!request.includes('wouldDecision') && !request.includes('outcome-confidence-below-threshold'));
      assert.ok(!request.includes('TENET blocked') && !request.includes('provider-private-prose'));
    }
    assert.deepEqual(output, [], 'observation writes no protocol stdout');
    const restored = SessionManager.open(session.sessionManager.getSessionFile()!);
    assert.ok(restored.getBranch().some(e => e.type === 'custom' && e.customType === 'tenet'));
    assert.ok(!JSON.stringify(restored.buildSessionContext()).includes('wouldDecision'));
    assert.ok(!recoverObservations(restored.getSessionId(), restored.getBranch(), EVIDENCE_DEFAULTS, []).snapshot().observations.some(o => o.origin.includes('tenet')));
    const branchFile = restored.createBranchedSession(restored.getLeafId()!);
    assert.ok(branchFile);
    const fork = SessionManager.open(branchFile!);
    assert.ok(!JSON.stringify(fork.buildSessionContext()).includes('wouldDecision'));
    assert.ok(!recoverObservations(fork.getSessionId(), fork.getBranch(), EVIDENCE_DEFAULTS, []).snapshot().observations.some(o => o.origin.includes('tenet')));
  } finally {
    process.stdout.write = stdout; session?.dispose(); globalThis.fetch = realFetch;
    await rm(cwd, { recursive: true, force: true });
  }
});
