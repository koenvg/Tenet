import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createGuard } from '../dist/sdk/index.js';
import { readArchive } from '../src/recording/archive.js';
import { invocationView } from '../src/inspector/view.js';
import { scriptedNative, APUS_MODEL, type NativeCall } from './apus-scripted.js';
import { ArchiveWriter } from '../src/recording/archive.js';
import { responseSnapshot } from '../src/recording/contract.js';
import { guardHarness } from './guard-harness.js';
import { recoverReport } from '../src/pi/report-history.js';

async function recorded(work: (home: string, cwd: string) => Promise<void>) {
  const home = await realpath(await mkdtemp('/tmp/tenet-native-history-'));
  const oldHome = process.env.HOME, oldFetch = globalThis.fetch;
  process.env.HOME = home;
  const cwd = join(home, 'project');
  await mkdir(cwd);
  await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
  await mkdir(join(home, '.tenet'), { mode: 0o700 });
  await writeFile(join(home, '.tenet/config.json'), JSON.stringify({ version: 1,
    judge: { provider: 'apus-llamacpp', baseUrl: 'http://127.0.0.1:8088', model: APUS_MODEL },
    decision: { deadlineMs: 5000 } }), { mode: 0o600 });
  try { await work(home, cwd); } finally {
    globalThis.fetch = oldFetch;
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    await rm(home, { recursive: true, force: true });
  }
}
async function assess(home: string, cwd: string, mutate?: (value: any, call: NativeCall) => any, capture = true) {
  const fake = scriptedNative({ mutate }); globalThis.fetch = fake.fetch;
  const directory = join(home, 'archive');
  const owner: any[] = [];
  const guard = createGuard({ host: 'offline', env: { TENET_MODE: 'enforce',
    TENET_RECORDING: capture ? 'on' : 'off', TENET_RECORDING_DIR: directory,
    TYPESAFE_API_KEY: 'must-not-forward-credential' }, controlPath: join(home, '.tenet/control.json'),
    onOwnerEvent: event => owner.push(event) });
  try {
    const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd);
    await session.ready;
    const call = { callId: 'c', toolName: 'inert-fixture', input: { token: 'input-credential', text: 'canonical-history-canary' } };
    const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 's', contextId: 'main', ...call }) });
    await guard.close();
    const archive = await readArchive(directory);
    return { ...archive, result, owner, calls: fake.calls, directory };
  } finally { await guard.close(); }
}

test('compiled SDK APUS archives keep canonical capture and an explicit native recording contract', async () => recorded(async (home, cwd) => {
  const archive = await assess(home, cwd);
  assert.deepEqual(archive.issues, []);
  assert.equal(archive.result.assessment.status, 'completed');
  const request = archive.records.find(r => r.stage === 'request')!.data as any;
  assert.deepEqual(request.nativeContract, {
    version: 'apus-recording-v1', renderingVersion: 'jev.dynamic.prompt.v2',
    rendererRevision: '7389d774472c9e29ddc84fffb392951f0f25de74', protocolVersion: 'llamacpp-b11118-choice-v1',
  });
  assert.equal(request.provider, 'apus-llamacpp');
  assert.equal(request.requestedModel, APUS_MODEL);
  assert.equal(request.payload.model, APUS_MODEL);
  assert.equal(request.payload.state.action.arguments.text, 'canonical-history-canary');
  assert.ok(!JSON.stringify(archive).includes('must-not-forward-credential'));
  assert.ok(!JSON.stringify(archive.records).includes('input-credential'));
}));

test('native histories show every submitted mapping and deterministic selector, not just the final metadata reply', async () => recorded(async (home, cwd) => {
  const archive = await assess(home, cwd);
  const responses = archive.records.filter(r => r.stage === 'response');
  assert.ok(responses.every(r => (r.data.nativeContract as any)?.version === 'apus-recording-v1'));
  const view = invocationView(archive.records);
  assert.equal(view.judge.provider, 'apus-llamacpp');
  assert.equal(view.judge.requestedModel, APUS_MODEL);
  assert.equal(view.judge.returnedModel, APUS_MODEL);
  assert.equal(view.native?.contract.version, 'apus-recording-v1');
  assert.equal(view.native?.requests.length, 4);
  assert.equal(view.native?.responses.length, 4);
  assert.deepEqual(view.native?.deterministic.map(d => d.question), ['rule_0_facts']);
  const request = view.native!.requests[0]!;
  assert.deepEqual(request.mapping, { A: 'PASS', B: 'APPROVAL_REQUIRED', C: 'FAIL', D: 'UNKNOWN', E: 'NOT_APPLICABLE' });
  assert.deepEqual(request.nativeRequest, archive.calls.find(c => c.path === '/completion')!.body);
  assert.equal(view.native!.deterministic[0]!.modelConfidence, false);
  assert.equal(view.native!.deterministic[0]!.authenticatedCoverage, false);
}));

test('archive reader rejects malformed or unknown native provenance without hiding malformed provider output', async () => recorded(async (home, cwd) => {
  const archive = await assess(home, cwd);
  const request = archive.records.find(r => r.stage === 'request')!;
  const folder = join(archive.directory, (await readdir(archive.directory))[0]!);
  const nativeRequest = archive.records.find(r => (r.data.value as any)?.kind === 'native-request')!;
  const selector = archive.records.find(r => (r.data.value as any)?.derivation === 'sole-allowed-facts-selector')!;
  const corrupt = [
    { ...request, data: { ...request.data, nativeContract: { ...(request.data.nativeContract as any), version: 'future-native' } } },
    { ...request, data: { ...request.data, requestedModel: 'wrong-alias' } },
    { ...nativeRequest, data: { ...nativeRequest.data, value: { ...(nativeRequest.data.value as any), mapping: { A: 'PASS', B: 'PASS' } } } },
    { ...selector, data: { ...selector.data, value: { ...(selector.data.value as any), modelConfidence: true } } },
  ];
  for (const [i, record] of corrupt.entries()) await writeFile(join(folder, `malformed-${i}.json`), JSON.stringify(record), { mode: 0o600 });
  const reread = await readArchive(archive.directory);
  assert.equal(reread.issues.length, 4);
  assert.equal(reread.records.length, archive.records.length);
}));

for (const failure of ['connectivity', 'partial', 'malformed', 'wrong-model'] as const) test(`APUS ${failure} archive is unavailable, keeps requested identity and does not invent a returned assessment`, async () => recorded(async (home, cwd) => {
  let scored = 0;
  const archive = await assess(home, cwd, (value, call) => {
    if (failure === 'connectivity' && call.path === '/v1/models') return new Response('private-provider-error', { status: 503 });
    if (call.path !== '/completion') return value;
    scored++;
    if (failure === 'partial' && scored === 2) return new Response('private-provider-error', { status: 503 });
    if (failure === 'malformed') return { ...value, completion_probabilities: [] };
    if (failure === 'wrong-model') return { ...value, model: 'different-backend' };
    return value;
  });
  assert.deepEqual(archive.issues, []);
  assert.equal(archive.result.assessment.status, 'unavailable');
  const view = invocationView(archive.records);
  assert.equal(view.judge.provider, 'apus-llamacpp');
  assert.equal(view.judge.requestedModel, APUS_MODEL);
  assert.equal(view.judge.returnedModel, null);
  assert.ok(!archive.records.some(r => r.stage === 'validation' && r.data.valid === true));
  assert.ok(!JSON.stringify(archive.records).includes('private-provider-error'));
  assert.equal(view.native!.responses.length, failure === 'connectivity' ? 0 : 1);
  if (failure === 'malformed') assert.deepEqual(view.native!.responses[0]!.raw.completion_probabilities, []);
  if (failure === 'wrong-model') assert.equal(view.native!.failureCategory, 'model-identity');
}));

test('oversized native transport remains unavailable before raw capture', async () => recorded(async (home, cwd) => {
  const archive = await assess(home, cwd, (value, call) => call.path === '/completion' ? {
    ...value, authorization: 'native-credential', note: 'x'.repeat(1024 * 1024 + 10),
  } : value);
  assert.deepEqual(archive.issues, []);
  assert.equal(archive.result.assessment.status, 'unavailable');
  const view = invocationView(archive.records);
  assert.equal(view.native!.responses.length, 0);
  assert.equal(view.judge.returnedModel, null);
  assert.ok(!JSON.stringify(archive.records).includes('native-credential'));
}));

test('capture-disabled native work sends no raw archive or owner event evidence; off and dormant add none', async () => recorded(async (home, cwd) => {
  const archive = await assess(home, cwd, undefined, false);
  assert.equal(archive.result.assessment.status, 'completed');
  assert.deepEqual(archive.records, []);
  assert.ok(!(await readdir(home)).includes('archive'));
  assert.ok(!JSON.stringify(archive.owner).includes('canonical-history-canary'));
  assert.ok(!JSON.stringify(archive.owner).includes('<|im_start|>'));
  const fake = scriptedNative(); globalThis.fetch = fake.fetch;
  const guard = createGuard({ host: 'offline', env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: archive.directory },
    controlPath: join(home, '.tenet/control.json') });
  try {
    const session = guard.openSession({ sessionId: 'off', contextId: 'main' }, cwd);
    await session.ready; await guard.setActivation('off');
    const c = { callId: 'off', toolName: 'fixture', input: {} };
    assert.equal((await session.beforeTool({ ...c, current: () => ({ sessionId: 'off', contextId: 'main', ...c }) })).bypassReason, 'off');
    const dormant = join(home, 'dormant'); await mkdir(dormant); await guard.setActivation('on');
    const d = guard.openSession({ sessionId: 'dormant', contextId: 'main' }, dormant); await d.ready;
    assert.equal((await d.beforeTool({ ...c, current: () => ({ sessionId: 'dormant', contextId: 'main', ...c }) })).bypassReason, 'dormant');
    assert.equal(fake.calls.length, 0);
  } finally { await guard.close(); }
  assert.deepEqual((await readArchive(archive.directory)).records, []);
}));

test('historical records retain recorded model fields and do not acquire APUS identities or native contracts', async () => recorded(async (home, cwd) => {
  const archive = await assess(home, cwd);
  const history = archive.records.filter(r => ['request', 'assessment'].includes(r.stage)).map(r => {
    const data: any = structuredClone(r.data);
    for (const key of ['nativeContract', 'judgeReportVersion', 'provider', 'requestedProvider', 'requestedModel', 'renderingVersion', 'rendererRevision']) delete data[key];
    if (data.payload) data.payload.model = 'historical-requested';
    if (data.assessment) data.assessment.model = 'historical-returned';
    return { ...r, data };
  });
  const copy = JSON.stringify(history);
  const view = invocationView(history);
  assert.deepEqual(view.judge, { provider: null, requestedModel: 'historical-requested', returnedModel: 'historical-returned', experimental: null });
  assert.equal(view.native, null);
  const oldNativeName = history.map(r => ({ ...r, data: { ...r.data, requestedProvider: 'apus-llamacpp', requestedModel: null } }));
  assert.equal(invocationView(oldNativeName).judge.experimental, null);
  assert.equal(invocationView(oldNativeName).judge.requestedModel, null);
  assert.equal(JSON.stringify(history), copy);
}));

test('bounded native archive snapshots retain omission markers and never restore removed token or credential fields', async () => recorded(async (home, cwd) => {
  const archive = await assess(home, cwd);
  const contract = archive.records.find(r => r.stage === 'request')!.data.nativeContract;
  const writer = new ArchiveWriter({ enabled: true, directory: join(home, 'bounded') });
  const sink = writer.bind({ host: 'offline', contextId: 'main', cwd, mode: 'observe', sessionId: 's', callId: 'bounded', invocationId: 'bounded', toolName: 'fixture' });
  const raw = { provider: 'apus-llamacpp', kind: 'native-response', question: 'rule_0_outcome', raw: {
    authorization: 'private-credential', completion_probabilities: [{ token: 'A', id: 32 }], note: 'x'.repeat(1024 * 1024 + 10),
  } };
  sink('response', { nativeContract: contract, ...responseSnapshot(raw) });
  sink('response', { nativeContract: contract, ...responseSnapshot(new Error('private-error')) });
  await writer.close();
  const reread = await readArchive(writer.config.directory);
  assert.deepEqual(reread.issues, []);
  assert.equal(reread.records.length, 2);
  const omitted = invocationView(reread.records).native!.omissions;
  assert.equal(omitted.length, 2);
  assert.equal(omitted[0]!.omittedFields, 2);
  assert.ok(Buffer.byteLength(omitted[0]!.preview as string) <= 1024 * 1024);
  assert.equal(omitted[0]!.value, undefined);
  assert.equal(omitted[1]!.unavailable, true);
  assert.ok(!JSON.stringify(reread).includes('private-credential'));
  assert.ok(!JSON.stringify(reread).includes('private-error'));
}));

test('SDK owner findings retain provider and requested/returned identities with capture disabled', async () => recorded(async (home, cwd) => {
  for (const fail of [false, true]) {
    const archive = await assess(home, cwd, (v, c) => fail && c.path === '/completion' ? new Response('private-error', { status: 503 }) : v, false);
    const report = archive.owner.find(e => e.type === 'permission')!.report;
    assert.equal(report.requestedProvider, 'apus-llamacpp');
    assert.equal(report.requestedModel, APUS_MODEL);
    assert.equal(report.returnedModel, fail ? undefined : APUS_MODEL);
    assert.ok(!JSON.stringify(report).includes('canonical-history-canary'));
    assert.ok(!JSON.stringify(report).includes('private-error'));
  }
}));

test('fake Pi owner status and findings name APUS experimental; private native data never enters agent results', async () => recorded(async () => {
  const fake = scriptedNative({ winners: ['C', 'A', 'A', 'A'] }); globalThis.fetch = fake.fetch;
  const h = await guardHarness({ judge: null });
  try {
    await h.start(); const result = await h.call(); await h.assessed();
    assert.equal(result, undefined);
    await h.commands.get('tenet').handler('status', h.ctx);
    assert.match(h.notifications.at(-1)!, /apus-llamacpp experimental/);
    let selection = 0;
    h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); return selection++ === 0 ? items[0] : undefined; };
    await h.commands.get('tenet').handler('', h.ctx);
    const detail = h.views.at(-1)!.items.join('\n');
    assert.match(detail, /Judge: apus-llamacpp experimental/);
    assert.match(detail, /Requested model: "apus-openjev-v1-4b-q8"/);
    assert.match(detail, /Returned model: "apus-openjev-v1-4b-q8"/);
    assert.match(detail, /Deterministic NONE is not model confidence or authenticated coverage/);
    assert.ok(!h.records.some(r => r.stage === 'request' || r.stage === 'response' || r.stage === 'message'));
    assert.ok(!JSON.stringify(h.records).includes('<|im_start|>'));
    const permission = h.records.find(r => r.stage === 'permission')!;
    const restored = recoverReport({ type: 'custom', customType: 'tenet', data: permission })!;
    assert.equal(restored.requestedProvider, 'apus-llamacpp');
    const legacy = structuredClone(permission);
    for (const k of ['judgeReportVersion', 'requestedProvider', 'requestedModel', 'returnedModel']) delete legacy[k];
    assert.equal(recoverReport({ type: 'custom', customType: 'tenet', data: legacy })!.requestedProvider, undefined);
    const future = { ...permission, judgeReportVersion: 'future' };
    assert.equal(recoverReport({ type: 'custom', customType: 'tenet', data: future }), undefined);
    await h.emit('session_tree'); selection = 0;
    await h.commands.get('tenet').handler('', h.ctx);
    assert.match(h.views.at(-1)!.items.join('\n'), /Returned model: "apus-openjev-v1-4b-q8"/);
    assert.equal(h.prompts.length, 0);
  } finally { await h.close(); }
}));

for (const mode of ['observe', 'enforce']) test(`fake Pi ${mode} native failures with capture on expose only safe failure categories`, async () => recorded(async () => {
  const fake = scriptedNative({ mutate: (v, c) => c.path === '/completion' ? new Response('private-body-canary', { status: 503 }) : v });
  globalThis.fetch = fake.fetch;
  const h = await guardHarness({ judge: null, env: { TENET_MODE: mode, TENET_RECORDING: 'on' } });
  try {
    await h.start(); const result = await h.call('c', { text: 'private-evidence-canary' });
    if (mode === 'observe') { assert.equal(result, undefined); await h.assessed(); }
    else { assert.equal(result.block, true); assert.ok(!JSON.stringify(result).includes('private')); }
    await h.shutdownCaptured();
    assert.ok(!JSON.stringify(h.records).includes('private-body-canary'));
    assert.ok(!JSON.stringify(h.records).includes('private-evidence-canary'));
    assert.ok(!JSON.stringify(h.records).includes('<|im_start|>'));
    assert.ok(!h.records.some(r => r.stage === 'request' || r.stage === 'response' || r.stage === 'message'));
    assert.equal(h.prompts.length, 0);
    assert.ok(h.notifications.some(n => n.includes('Submitted evidence may contain secrets')));
  } finally { await h.close(); }
}));
