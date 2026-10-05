import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { alias, scriptedNative } from './archive-native.mjs';

// A fresh process loads the registered production entry. Only model output and
// judge transport are scripted; no alternate guard factory or release path.
const [installation, project, expectedMode, provider = 'typesafe'] = process.argv.slice(2);
assert.equal(process.env.TENET_MODE ?? 'observe', expectedMode);
const settingsManager = SettingsManager.create(project, process.env.PI_CODING_AGENT_DIR);
const statuses = [], notifications = [], views = [], confirmations = [];
let outcome = 'FAIL', approved = false, executed = 0, requests = 0, session;
let releaseAssessment;
const assessmentHeld = new Promise(resolve => { releaseAssessment = resolve; });
const originalFetch = globalThis.fetch;
const typesafeFetch = async (url, init) => {
  assert.equal(String(url), 'https://api.typesafe.ai/v1/systemone', 'no non-scripted network destination');
  requests++;
  const body = JSON.parse(init.body);
  assert.equal(body.state.context.cwd, project);
  assert.equal(body.state.policy.rules[0].text, 'Ask before overwriting owner-demo.txt.');
  assert.deepEqual(body.state.action.arguments, { value: 'harmless' });
  if (expectedMode === 'observe') await assessmentHeld;
  const outcomeKeys = Object.keys(body.questions).filter(key => key.endsWith('_outcome'));
  const integrityKey = outcomeKeys.at(-1);
  const answers = Object.fromEntries(Object.entries(body.questions).map(([key, question]) => {
    const choice = key.endsWith('_facts') ? 'NONE' : key.endsWith('_evidence') ? 'SUFFICIENT' : key === integrityKey ? 'PASS' : outcome;
    return [key, { type: 'choice', choice, confidence: 1,
      probabilities: Object.fromEntries(Object.keys(question.criteria).map(label => [label, +(label === choice)])) }];
  }));
  return Response.json({ model: 'offline-owner-script', answers });
};
const native = scriptedNative({ outcome: () => outcome, beforeCompletion: async question => {
  if (question === 0) {
    requests++;
    if (expectedMode === 'observe') await assessmentHeld;
  }
} });
globalThis.fetch = provider === 'apus-llamacpp' ? native.fetch : typesafeFetch;
try {
  const loader = new DefaultResourceLoader({ cwd: project, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [pi => {
      pi.registerTool({ name: 'owner_dummy', label: 'Owner demo', description: 'Write only the disposable local owner-demo.txt',
        parameters: Type.Object({ value: Type.String() }), async execute(_id, args) {
          assert.deepEqual(args, { value: 'harmless' });
          await writeFile(join(project, 'owner-demo.txt'), args.value);
          executed++;
          return { content: [{ type: 'text', text: 'local demo written' }], details: {} };
        } });
    }] });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  assert.equal(loader.getExtensions().extensions.filter(e => e.path.startsWith(installation)).length, 1);
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null,
    modelsStorePath: join(project, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  const model = modelRuntime.getModels()[0]; assert.ok(model);
  ({ session } = await createAgentSession({ cwd: project, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
    modelRuntime, model, resourceLoader: loader, sessionManager: SessionManager.inMemory(project) }));
  await session.bindExtensions({ mode: 'tui', uiContext: {
    notify(text) { notifications.push(text); }, setStatus(_key, text) { statuses.push(text); },
    async confirm(title, body) { confirmations.push({ title, body }); return approved; },
    async select(title, items) { views.push({ title, items }); return views.length === 1 ? items[0] : undefined; },
  } });
  let pending, serial = 0;
  session.agent.streamFunction = () => {
    const stream = createAssistantMessageEventStream(); const call = pending; pending = undefined;
    const message = { role: 'assistant', content: call ? [call] : [{ type: 'text', text: 'done' }], api: model.api,
      provider: model.provider, model: model.id, timestamp: Date.now(), stopReason: call ? 'toolUse' : 'stop',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
    stream.push({ type: 'done', reason: message.stopReason, message }); stream.end(message); return stream;
  };
  const invoke = async () => {
    pending = { type: 'toolCall', id: `owner-${++serial}`, name: 'owner_dummy', arguments: { value: 'harmless' } };
    await session.agent.prompt('Run the scripted local demo.');
  };
  const records = () => session.sessionManager.getEntries().flatMap(e => e.type === 'custom' && e.customType === 'tenet' ? [e.data] : []);
  await session.prompt('/tenet status');
  assert.ok(statuses.some(s => s.startsWith(`TENET ON ${expectedMode.toUpperCase()}`)));
  assert.match(notifications.at(-1), /argument stability|arguments-not-frozen/);
  assert.ok(notifications.some(s => s.includes(`judge ${provider}`) && s.includes('connectivity unverified')),
    'explicit native status identifies the selected judge independently of startup UI timing');
  if (provider === 'apus-llamacpp') assert.ok(notifications.some(s => s.includes(`judge ${provider} experimental`)));
  if (expectedMode === 'observe') {
    // Permission and the local effect happen while judgment is still pending.
    await invoke(); assert.equal(executed, 1); assert.equal(confirmations.length, 0);
    assert.ok(records().some(r => r.stage === 'assessment-status' && r.status === 'pending'));
    releaseAssessment();
    for (let i = 0; i < 400 && !records().some(r => r.stage === 'assessment-status' && r.status === 'completed'); i++)
      await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(records().some(r => r.stage === 'assessment-status' && r.status === 'completed'));
    assert.ok(records().some(r => r.stage === 'permission' && r.outcome === 'released'));
    await session.prompt('/tenet');
    assert.match(views[1].items.join('\n'), /FAIL|rule-fail/);
    assert.match(views[1].items.join('\n'), /BLOCK/);
    assert.equal(confirmations.length, 0);
    // Capture opt-out and shared on/off do not select a different mode.
    await session.prompt('/tenet off'); await invoke(); assert.equal(executed, 2);
    assert.equal(requests, 1);
    await session.prompt('/tenet on');
    assert.ok(statuses.filter(s => s.startsWith('TENET ON') || s.startsWith('TENET OFF')).at(-1).startsWith('TENET ON OBSERVE'));
  } else {
    outcome = 'PASS'; await invoke(); assert.equal(executed, 1);
    outcome = 'APPROVAL_REQUIRED'; await invoke(); assert.equal(executed, 1);
    approved = true; await invoke(); assert.equal(executed, 2);
    assert.equal(confirmations.length, 2); assert.match(confirmations[0].body, /owner-demo.txt/);
    outcome = 'FAIL'; await invoke(); assert.equal(executed, 2);
    await session.prompt('/tenet');
    assert.match(views[1].items.join('\n'), /FAIL|rule-fail/);
    assert.ok(records().some(r => r.stage === 'permission' && r.outcome === 'blocked'));
  }
  assert.equal(await readFile(join(project, 'owner-demo.txt'), 'utf8'), 'harmless');
  assert.ok(records().some(r => r.stage === 'execution' && r.outcome === 'unknown'), 'native results are not exact execution proof');
  if (provider === 'apus-llamacpp') {
    assert.ok(records().some(r => r.stage === 'assessment' && r.requestedProvider === provider && r.requestedModel === alias));
    const findings = records().filter(r => ['assessment', 'permission', 'assessment-status'].includes(r.stage));
    assert.ok(findings.length > 0);
    assert.ok(findings.every(r => r.version === 3 && r.judgeReportVersion === 'judge-report-v1'
      && r.requestedProvider === provider && r.requestedModel === alias));
    assert.ok(findings.some(r => r.returnedModel === alias), 'validated owner findings retain returned identity');
    assert.equal(native.calls.filter(c => c.path === '/completion').length, expectedMode === 'observe' ? 4 : 16);
    assert.ok(!records().some(r => r.stage === 'request' || r.stage === 'response'), 'capture-off must not store native payloads');
    assert.ok(!JSON.stringify(session.messages).includes('<|im_start|>'), 'native prompts remain out of agent history');
  }
  if (expectedMode === 'observe')
    assert.ok(!session.messages.some(m => JSON.stringify(m).includes('rule-fail')), 'observation findings stay out of agent messages');
  await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
  session.dispose(); session = undefined;
  console.log(`${process.versions.bun ? 'Bun' : 'Node'} registered owner flow ${provider}/${expectedMode}: native status/findings, ${executed} local writes, ${confirmations.length} native confirmations; no live requests.`);
} finally {
  releaseAssessment();
  if (session) {
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    session.dispose();
  }
  globalThis.fetch = originalFetch;
}
