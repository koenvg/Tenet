import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { alias, scriptedNative } from './archive-native.mjs';

const installation = fileURLToPath(new URL('../../', import.meta.resolve('tenet')));
assert.ok(installation.includes('tenet-relocated-'));
const home = await fsp.realpath(await fsp.mkdtemp(join(process.cwd(), 'judge-home-')));
const previousHome = process.env.HOME;
const originalFetch = globalThis.fetch;
process.env.HOME = home;
const project = join(home, 'project');
await fsp.mkdir(project);
await fsp.writeFile(join(project, 'TENET.md'), 'Rule; Keep work local.');
await fsp.mkdir(join(home, '.tenet'), { mode: 0o700 });
const file = join(home, '.tenet/config.json');
const guide = await fsp.readFile(join(installation, 'docs/judge.md'), 'utf8');
const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]));
assert.equal(examples.length, 4, 'official, anonymous local, partial project and APUS examples');
const settings = examples.find(v => v.judge?.protocol === 'apus-llamacpp');
const official = examples.find(v => v.judge?.protocol === 'system-one' && v.judge.baseUrl === 'https://api.typesafe.ai');
assert.ok(settings); assert.ok(official);
await fsp.writeFile(file, JSON.stringify(settings), { mode: 0o600 });
let guard, traps, writer;
const originals = [];
try {
  traps = await import('./archive-offline-trap.mjs');
  // The ESM loader itself must read installed modules; non-module setup reads are forbidden on import.
  let importReads = 0, importPhase = true;
  for (const [module, keys] of [[fs, ['lstatSync', 'openSync', 'readFileSync', 'statSync']], [fsp, ['lstat', 'open', 'readFile', 'stat']]]) {
    for (const key of keys) {
      const original = module[key]; originals.push([module, key, original]);
      module[key] = (path, ...args) => {
        if (importPhase && !String(path).includes(installation)) { importReads++; throw new Error('import must not inspect owner setup'); }
        return original(path, ...args);
      };
    }
  }
  syncBuiltinESMExports();
  const { createGuard } = await import('tenet');
  const { diagnoseProject } = await import(new URL('../doctor/doctor.js', import.meta.resolve('tenet')));
  assert.equal(importReads, 0);
  importPhase = false; // The settings reader can retain imported read functions in its filesystem seam.
  for (const [module, key, original] of originals) module[key] = original;
  syncBuiltinESMExports();
  const before = fs.readdirSync(home, { recursive: true }).sort();
  const diagnosis = await diagnoseProject({ projectDir: project, deliveryDir: installation, env: { TENET_RECORDING: 'off' } });
  assert.equal(diagnosis.state, 'ready', diagnosis.issues.map(i => i.code).join(','));
  assert.equal(diagnosis.judge.provider, 'apus-llamacpp');
  assert.equal(diagnosis.judge.requestedModel, alias);
  assert.equal(diagnosis.judge.experimental, true);
  assert.equal(diagnosis.judge.connectivity, 'unverified');
  assert.equal(diagnosis.delivery.status, 'complete');
  assert.equal(diagnosis.settings.deadlineMs, 120000);
  assert.deepEqual(diagnosis.settings.observation, settings.observation);
  assert.equal(diagnosis.assessment, 'not-requested');
  assert.equal(diagnosis.provider, 'unverified');
  assert.ok(!diagnosis.limitations.some(i => i.code === 'missing-credentials'));
  assert.ok(!JSON.stringify(diagnosis).includes(settings.judge.baseUrl));
  assert.deepEqual(fs.readdirSync(home, { recursive: true }).sort(), before);
  traps.assertNoAttempts(); traps.restore();

  const { readOwnerSettings, readProjectSettings } = await import(new URL('../runtime/settings.js', import.meta.resolve('tenet')));
  for (const value of examples) {
    await fsp.writeFile(file, JSON.stringify(value), { mode: 0o600 });
    assert.equal(readProjectSettings(home).state, 'valid', 'ACTUAL archive project reader must accept every shipped example');
    assert.equal(readOwnerSettings().state, value.judge ? 'valid' : 'invalid',
      'ACTUAL archive owner reader must require a complete judge, rejecting partial project examples');
  }
  await fsp.writeFile(file, JSON.stringify(settings), { mode: 0o600 });
  let failing = false;
  const fake = scriptedNative({ fail: () => failing }); globalThis.fetch = fake.fetch;
  const { ArchiveWriter, readArchive } = await import(new URL('../recording/archive.js', import.meta.resolve('tenet')));
  const { nativeHistory, recordedJudge } = await import(new URL('../recording/native.js', import.meta.resolve('tenet')));
  const { recordedInputs, recordedSubmissions } = await import(new URL('../recording/scoped.js', import.meta.resolve('tenet')));
  const { recordedJudgeReport } = await import(new URL('../recording/judge.js', import.meta.resolve('tenet')));
  writer = new ArchiveWriter({ enabled: true, directory: join(home, 'external-archive') });
  const records = [], owner = [];
  guard = createGuard({ host: 'archive-native', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
    controlPath: join(home, '.tenet/control.json'), onOwnerEvent: event => owner.push(event),
    bindRecording: identity => {
      const sink = writer.bind(identity);
      return (stage, data) => { records.push({ stage, data }); sink(stage, data); };
    } });
  assert.equal(fake.calls.length, 0, 'construction must be lazy');
  assert.deepEqual(guard.status().projects, []);
  const identity = { sessionId: 'archive', contextId: 'main' };
  const session = guard.openSession(identity, project);
  assert.equal((await session.ready).state, 'ready'); assert.equal(fake.calls.length, 0);
  assert.equal(session.status().judge.requestedModel, alias);
  assert.equal(session.status().configuration.deadlineMs, 120000);
  // Change settings while the guard exists. It must retain the initial immutable snapshot.
  await fsp.writeFile(file, JSON.stringify(official), { mode: 0o600 });
  const invoke = async callId => {
    const call = { callId, toolName: 'inert-fixture', input: { text: 'literal data, no executor' } };
    return session.beforeTool({ ...call, current: () => ({ ...identity, ...call }) });
  };
  const result = await invoke('complete');
  assert.equal(result.assessment.status, 'completed'); assert.equal(result.permission, 'released');
  assert.equal(result.execution, 'unknown');
  assert.equal(fake.calls.filter(c => c.path === '/completion').length, 4);
  const assessment = records.find(r => r.stage === 'assessment').data;
  assert.equal(assessment.requestedProvider, 'apus-llamacpp');
  assert.equal(assessment.requestedModel, alias); assert.equal(assessment.assessment.model, alias);
  assert.ok(records.some(r => r.data.value?.derivation === 'sole-allowed-facts-selector'));
  const contract = { version: 'apus-recording-v2', renderingVersion: 'jev.dynamic.prompt.v2',
    rendererRevision: '7389d774472c9e29ddc84fffb392951f0f25de74', protocolVersion: 'llamacpp-b11118-choice-v1' };
  for (const stage of ['request', 'response', 'validation']) {
    const captured = records.filter(r => r.stage === stage && (stage !== 'response' || r.data.nativeContract !== undefined));
    assert.equal(captured.length, stage === 'response' ? 11 : 1);
    for (const record of captured) assert.deepEqual(record.data.nativeContract, contract);
  }
  const request = records.find(r => r.stage === 'request').data;
  assert.equal(request.questionVersion, 'policy-rules-v9-scoped');
  assert.equal(request.inputVersion, 'judge-input-scopes-v1');
  assert.equal(request.selectionVersion, 'judge-input-scopes-v1');
  assert.equal(assessment.assessment.profile, 'applicability-v1');
  const inputs = recordedInputs(request);
  assert.equal(inputs.layout, 'scoped'); assert.equal(inputs.sharedState, null);
  assert.deepEqual(inputs.scopes.map(s => s.id), ['ordinary:0', 'exemption:0', 'policy-protection']);
  const fields = [
    ['rule', 'thinkingTrace', 'previousToolCall', 'proposedToolCall'],
    ['rule', 'proposedToolCall', 'binding', 'resolvedAction', 'allowedFactReferences'],
    ['rule', 'proposedToolCall', 'context', 'policy', 'resolvedAction'],
  ];
  for (const [i, scope] of inputs.scopes.entries()) {
    assert.deepEqual(Object.keys(scope.state), fields[i]);
    assert.equal(scope.stateBytes, Buffer.byteLength(JSON.stringify(scope.state)));
    assert.deepEqual(scope.state.proposedToolCall, { toolName: 'inert-fixture', arguments: { text: 'literal data, no executor' } });
  }
  assert.deepEqual(inputs.scopes[0].state.thinkingTrace, { status: 'unavailable' });
  assert.deepEqual(inputs.scopes[0].state.previousToolCall, { status: 'unavailable' });
  assert.equal(inputs.scopes[1].state.allowedFactReferences, null);
  assert.equal(inputs.scopes[1].state.binding.cwd, project);
  assert.deepEqual(inputs.scopes[2].state.policy, { candidates: request.integrity.candidates, targets: request.integrity.targets });
  assert.deepEqual(request.evidenceContext.scopes, inputs.scopes.map(s => ({ id: s.id, fields: Object.keys(s.state), stateBytes: s.stateBytes })));
  assert.equal(request.evidenceContext.totalStateBytes, inputs.scopes.reduce((n, s) => n + s.stateBytes, 0));
  assert.equal(request.evidenceContext.history, null);
  assert.equal(await writer.drain(), true);
  const archived = await readArchive(writer.config.directory);
  assert.deepEqual(archived.issues, []);
  assert.ok(archived.records.every(r => r.schemaVersion === 5));
  const history = nativeHistory(archived.records);
  assert.deepEqual(history.contract, contract);
  assert.equal(history.requests.length, 4); assert.equal(history.responses.length, 4);
  assert.equal(history.metadata.length, 2); assert.equal(history.deterministic.length, 1);
  assert.deepEqual(history.requests[0].nativeRequest, fake.calls.find(c => c.path === '/completion').body);
  assert.equal(history.deterministic[0].modelConfidence, false);
  assert.equal(history.deterministic[0].authenticatedCoverage, false);
  assert.deepEqual(history.requests.map(r => r.scopeId), ['ordinary:0', 'ordinary:0', 'policy-protection', 'policy-protection']);
  assert.deepEqual(history.responses.map(r => r.scopeId), history.requests.map(r => r.scopeId));
  assert.equal(history.deterministic[0].scopeId, 'exemption:0');
  const scopedResponses = archived.records.filter(r => r.stage === 'response' && r.data.nativeContract === undefined);
  assert.equal(scopedResponses.length, 9);
  assert.ok(scopedResponses.every(r => r.data.inputVersion === 'judge-input-scopes-v1'));
  const submissions = recordedSubmissions(archived.records);
  assert.deepEqual(submissions.filter(s => s.status === 'unavailable').map(s => [s.scopeId, s.reason]),
    [['exemption:0', 'deterministic-NONE-no-native-request']]);
  for (const status of ['attempted', 'completed']) {
    const submitted = submissions.filter(s => s.status === status);
    assert.equal(submitted.length, 4);
    for (const submission of submitted) {
      const scope = inputs.scopes.find(s => s.id === submission.scopeId);
      assert.deepEqual(submission.payload.state, scope.state);
      assert.deepEqual(Object.keys(submission.payload.questions), submission.questionKeys);
      for (const key of submission.questionKeys) {
        assert.equal(request.payload.questionScopes[key], scope.id);
        assert.deepEqual(submission.payload.questions[key], request.payload.questions[key]);
      }
    }
  }
  assert.deepEqual(recordedJudge(archived.records), { provider: 'apus-llamacpp', requestedModel: alias,
    returnedModel: alias, experimental: true });
  const report = owner.find(e => e.type === 'permission').report;
  assert.deepEqual(recordedJudgeReport(report), { judgeReportVersion: 'judge-report-v1',
    requestedProvider: 'apus-llamacpp', requestedModel: alias, returnedModel: alias });
  assert.ok(!fs.existsSync(join(home, '.tenet/recordings')), 'capture-off external test sink must not create local archive');
  failing = true; const count = fake.calls.length;
  const failed = await invoke('failed');
  assert.equal(failed.permission, 'blocked'); assert.equal(failed.assessment.status, 'unavailable');
  assert.equal(await writer.drain(), true);
  const unavailable = await readArchive(writer.config.directory);
  assert.deepEqual(unavailable.issues, []);
  const failedRecords = unavailable.records.filter(r => r.callId === 'failed');
  assert.ok(failedRecords.length > 0);
  assert.equal(recordedJudge(failedRecords).requestedModel, alias);
  assert.equal(recordedJudge(failedRecords).returnedModel, null);
  assert.equal(nativeHistory(failedRecords).responses.length, 0);
  const failedReport = owner.filter(e => e.type === 'permission').at(-1).report;
  assert.equal(recordedJudgeReport(failedReport).judgeReportVersion, 'judge-report-v1');
  assert.equal(failedReport.returnedModel, undefined);
  assert.equal(fake.calls.length, count + 1, 'one failure, no retry or fallback');
  assert.ok(!JSON.stringify(records.filter(r => r.stage !== 'response')).includes('private-offline-error-canary'));
  await guard.setActivation('off');
  const noCalls = fake.calls.length;
  assert.equal((await invoke('off')).bypassReason, 'off');
  const dormantProject = join(home, 'dormant'); await fsp.mkdir(dormantProject);
  const dormant = guard.openSession({ sessionId: 'dormant', contextId: 'main' }, dormantProject);
  assert.equal((await dormant.ready).state, 'dormant');
  assert.equal(fake.calls.length, noCalls, 'off/dormant SDK must not probe provider metadata');
  await guard.setActivation('on');
  await guard.close(); guard = undefined;
  const restarted = createGuard({ host: 'archive-restarted', env: { TENET_RECORDING: 'off' } });
  const restartedSession = restarted.openSession({ sessionId: 'restarted', contextId: 'main' }, project);
  assert.equal((await restartedSession.ready).judge.provider, 'typesafe');
  assert.equal(restartedSession.status().judge.reason, 'missing-credentials'); await restarted.close();
  await fsp.writeFile(file, JSON.stringify({ ...settings, forbidden: 'private-settings-canary' }), { mode: 0o600 });
  const invalid = createGuard({ host: 'archive-invalid', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' } });
  assert.deepEqual(invalid.status().projects, []);
  const blocked = invalid.openSession({ sessionId: 'invalid', contextId: 'main' }, project);
  assert.equal((await blocked.ready).state, 'unavailable');
  assert.equal(blocked.status().judge.provider, 'unknown'); assert.equal(blocked.status().judge.reason, 'configuration');
  const attempts = fake.calls.length;
  assert.equal((await blocked.beforeTool({ callId: 'bad', toolName: 'inert', input: {} })).permission, 'blocked');
  assert.equal(fake.calls.length, attempts); await invalid.close();
  let constructed = 0;
  const invalidInjected = createGuard({ host: 'archive-invalid-injected', env: { TENET_RECORDING: 'off' },
    createJudge: () => { constructed++; throw new Error('invalid settings must prevent construction'); } });
  const invalidInjectedSession = invalidInjected.openSession({ sessionId: 'invalid-injected', contextId: 'main' }, project);
  assert.equal((await invalidInjectedSession.ready).judge.reason, 'configuration');
  assert.equal(constructed, 0); await invalidInjected.close();
  console.log(`${process.versions.bun ? 'Bun' : 'Node'} archive APUS: side-effect-free imports/doctor, parsed settings, frozen identity, complete native metadata, failure without fallback passed.`);
} finally {
  for (const [module, key, original] of originals) module[key] = original;
  syncBuiltinESMExports();
  traps?.restore();
  await guard?.close(); globalThis.fetch = originalFetch;
  await writer?.close();
  process.env.HOME = previousHome;
  await fsp.rm(home, { recursive: true, force: true });
}
