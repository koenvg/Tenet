import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { Type } from 'typebox';

const installation = process.argv[2];
process.env.TENET_RECORDING = 'off';
process.env.TENET_MODE = 'enforce';
process.env.TYPESAFE_API_KEY = '';
const { registerGuard } = await import(new URL('../pi/guard.js', import.meta.resolve('tenet')));
const root = await realpath(await mkdtemp(join(process.cwd(), 'pi-exercise-')));
const fetchHTTP = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('network forbidden in Pi exercise'); };
let session;
try {
  await writeFile(join(root, 'TENET.md'), 'Rule; BLOCK; Ask before publishing the harmless dummy value.');
  const settingsManager = SettingsManager.inMemory({ packages: [installation], compaction: { enabled: false }, retry: { enabled: false } });
  const resources = { cwd: root, agentDir: root, settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true };
  const discovered = new DefaultResourceLoader(resources);
  await discovered.reload();
  assert.deepEqual(discovered.getExtensions().errors, []);
  assert.equal(discovered.getExtensions().extensions.length, 1);
  assert.ok(discovered.getExtensions().extensions[0].path.startsWith(installation));
  assert.ok(discovered.getExtensions().extensions[0].handlers.has('tool_call'));
  const extension = discovered.getExtensions().extensions[0];
  const ctx = { cwd: root, hasUI: false, sessionManager: { getSessionId: () => 'installed-entry', getBranch: () => [] } };
  for (const handler of extension.handlers.get('session_start')) await handler({ type: 'session_start', reason: 'startup' }, ctx);
  const [gate] = extension.handlers.get('tool_call');
  const veto = await gate({ type: 'tool_call', toolName: 'dummy', toolCallId: 'missing-key', input: { value: 'harmless' } }, ctx);
  assert.equal(veto.block, true); assert.match(veto.reason, /missing-credentials/);
  for (const handler of extension.handlers.get('session_shutdown')) await handler({ type: 'session_shutdown', reason: 'quit' }, ctx);
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null,
    modelsStorePath: join(root, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  const model = modelRuntime.getModels()[0]; assert.ok(model);
  let outcome = 'PASS', approved = false, executed = 0;
  const judge = async request => {
    const rule = (id, choice, integrity = false) => ({ ruleId: id,
      outcome: { choice, probabilities: { PASS: +(choice === 'PASS'), APPROVAL_REQUIRED: +(choice === 'APPROVAL_REQUIRED'),
        FAIL: +(choice === 'FAIL'), UNKNOWN: 0, ...(integrity ? {} : { NOT_APPLICABLE: 0 }) } },
      evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } });
    return { profile: 'applicability-v1', model: 'offline-script',
      rules: [...request.policy.rules.map(r => rule(r.id, outcome)), rule('builtin:policy-integrity', 'PASS', true)] };
  };
  // Inject only the evaluator via the shipped adapter. No thresholds or dispatch code change.
  const loader = new DefaultResourceLoader({ ...resources, noExtensions: true, extensionFactories: [pi => {
    pi.registerTool({ name: 'dummy', label: 'Dummy', description: 'Harmless archive executor', parameters: Type.Object({ value: Type.String() }),
      async execute(_id, args) { assert.deepEqual(args, { value: 'harmless' }); executed++; return { content: [{ type: 'text', text: 'dummy-result' }], details: {} }; } });
    registerGuard(pi, { env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' }, controlPath: join(root, 'control.json'), judge });
  }] });
  await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
  ({ session } = await createAgentSession({ cwd: root, agentDir: root, modelRuntime, model, settingsManager,
    resourceLoader: loader, sessionManager: SessionManager.inMemory(root) }));
  await session.bindExtensions({ mode: 'tui', uiContext: { notify() {}, setStatus() {}, async confirm() { return approved; } } });
  let pending, serial = 0;
  session.agent.streamFunction = () => {
    const stream = createAssistantMessageEventStream(); const call = pending; pending = undefined;
    const message = { role: 'assistant', content: call ? [call] : [{ type: 'text', text: 'done' }], api: model.api, provider: model.provider, model: model.id,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: call ? 'toolUse' : 'stop', timestamp: Date.now() };
    stream.push({ type: 'done', reason: message.stopReason, message }); stream.end(message); return stream;
  };
  const invoke = async () => {
    pending = { type: 'toolCall', id: `archive-${++serial}`, name: 'dummy', arguments: { value: 'harmless' } };
    await session.agent.prompt('Run the scripted harmless dummy.');
  };
  await invoke(); assert.equal(executed, 1);
  outcome = 'APPROVAL_REQUIRED'; await invoke(); assert.equal(executed, 1);
  approved = true; await invoke(); assert.equal(executed, 2);
  outcome = 'FAIL'; await invoke(); assert.equal(executed, 2);
  const records = session.sessionManager.getEntries().flatMap(e => e.type === 'custom' && e.customType === 'tenet' ? [e.data] : []);
  assert.ok(records.some(r => r.stage === 'decision' && r.decision === 'BLOCK'));
  assert.ok(records.some(r => r.stage === 'permission' && r.outcome === 'blocked'));
  assert.ok(records.some(r => r.stage === 'permission' && r.outcome === 'released'));
  console.log(`${process.versions.bun ? 'Bun' : 'Node'} pinned Pi: exactly one installed extension, PASS/denied ASK/approved ASK/BLOCK dispatched 2 dummy calls.`);
} finally {
  session?.dispose(); globalThis.fetch = fetchHTTP;
  await rm(root, { recursive: true, force: true });
}
