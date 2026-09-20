import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
  type ExtensionAPI, type ExtensionContext, type ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, InMemoryCredentialStore, type AssistantMessage, type ToolCall } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { registerGuard } from '../src/pi/guard.js';
import { argumentDigest } from '../src/decision/evidence.js';
import { RULE, INTEGRITY_ID } from '../src/decision/policy.js';
import type { Action, Outcome } from '../src/decision/contracts.js';
import { answer, ruleAnswer } from './helpers.js';

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
    const loader = new DefaultResourceLoader({ cwd, agentDir: cwd, settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [pi => {
        extensionAPI = pi;
        pi.registerTool({ name: 'dummy', label: 'Dummy', description: 'Offline dummy with arbitrary payload',
          parameters: Type.Object({ payload: Type.Unknown() }),
          async execute(_id, args) {
            assert.equal(argumentDigest(args), assessed.at(-1)?.argumentDigest);
            executed.push(structuredClone(args));
            if (executorFailure) throw new Error('dummy executor failed');
            return { content: [{ type: 'text', text: 'done' }], details: {} };
          } });
        registerGuard(pi, { env: {}, judge: async request => {
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
    let pendingCall: ToolCall | undefined;
    session.agent.streamFunction = () => {
      const stream = createAssistantMessageEventStream();
      const call = pendingCall; pendingCall = undefined;
      const message: AssistantMessage = { role: 'assistant', content: call ? [call] : [{ type: 'text', text: 'done' }],
        api: model.api, provider: model.provider, model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: call ? 'toolUse' : 'stop', timestamp: Date.now() };
      stream.push({ type: 'done', reason: message.stopReason as 'toolUse' | 'stop', message });
      stream.end(message);
      return stream;
    };
    let serial = 0;
    const invoke = async (name: string, args: Record<string, unknown>) => {
      pendingCall = { type: 'toolCall', id: `smoke-${++serial}`, name, arguments: args };
      await session!.agent.prompt('scripted offline call');
    };
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
    assert.ok(records.some(r => r.stage === 'execution' && r.outcome === 'executed'));
    for (const callId of ['smoke-1', 'smoke-3', 'smoke-7', 'smoke-8', 'smoke-10']) {
      assert.ok(records.some(r => r.stage === 'execution' && r.callId === callId && r.outcome === 'executed'));
    }
    assert.ok(records.some(r => r.stage === 'execution' && r.callId === 'smoke-6' && r.outcome === 'failed'));
    assert.ok(records.some(r => r.stage === 'execution' && r.outcome === 'failed'));
    assert.ok(!records.some(r => r.stage === 'execution' && ['smoke-2', 'smoke-4', 'smoke-5', 'smoke-9'].includes(r.callId)));
    assert.ok(records.some(r => r.stage === 'status' && r.ruleCount === 2 && r.questionVersion === 'policy-rules-v3-trajectory'));
    for (const callId of ['smoke-11', 'smoke-12']) {
      assert.ok(records.some(r => r.stage === 'permission' && r.callId === callId && r.outcome === 'blocked'));
      assert.ok(!records.some(r => r.stage === 'execution' && r.callId === callId));
    }
    assert.ok(!JSON.stringify(records).includes('hidden-credential'));
  } finally {
    session?.dispose();
    globalThis.fetch = realFetch;
    await rm(cwd, { recursive: true, force: true });
  }
});

test('production extension entry loads with pinned Pi and missing credentials remains fail-closed', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tenet-entry-'));
  const previousKey = process.env.TYPESAFE_API_KEY;
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
    assert.ok(records.some(r => r.stage === 'status' && r.questionVersion === 'policy-rules-v3-trajectory' && r.ruleCount === 1));
    const [handler] = extensions[0]!.handlers.get('tool_call')!;
    const result = await handler!({ type: 'tool_call', toolName: 'unfamiliar', toolCallId: 'missing-key', input: {} }, ctx);
    assert.ok(result && typeof result === 'object' && 'block' in result && 'reason' in result);
    assert.equal(result.block, true);
    assert.match(String(result.reason), /missing-credentials/);
  } finally {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    await rm(cwd, { recursive: true, force: true });
  }
});
