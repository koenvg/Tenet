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
assert.equal(examples.length, 2);
const settings = examples.find(v => v.judge.provider === 'apus-llamacpp');
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

  const { readOwnerSettings } = await import(new URL('../runtime/settings.js', import.meta.resolve('tenet')));
  for (const value of examples) {
    await fsp.writeFile(file, JSON.stringify(value), { mode: 0o600 });
    assert.equal(readOwnerSettings().state, 'valid', 'ACTUAL archive reader must accept shipped examples');
  }
  await fsp.writeFile(file, JSON.stringify(settings), { mode: 0o600 });
  let failing = false;
  const fake = scriptedNative({ fail: () => failing }); globalThis.fetch = fake.fetch;
  const { ArchiveWriter, readArchive } = await import(new URL('../recording/archive.js', import.meta.resolve('tenet')));
  const { nativeHistory, recordedJudge } = await import(new URL('../recording/native.js', import.meta.resolve('tenet')));
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
  assert.equal(guard.status().judge.requestedModel, alias);
  assert.equal(guard.status().configuration.deadlineMs, 120000);
  const identity = { sessionId: 'archive', contextId: 'main' };
  const session = guard.openSession(identity, project);
  assert.equal((await session.ready).state, 'ready'); assert.equal(fake.calls.length, 0);
  // Change settings while the guard exists. It must retain the initial immutable snapshot.
  await fsp.writeFile(file, JSON.stringify({ version: 1, judge: { provider: 'typesafe' } }), { mode: 0o600 });
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
  const contract = { version: 'apus-recording-v1', renderingVersion: 'jev.dynamic.prompt.v2',
    rendererRevision: '7389d774472c9e29ddc84fffb392951f0f25de74', protocolVersion: 'llamacpp-b11118-choice-v1' };
  for (const stage of ['request', 'response', 'validation']) {
    const captured = records.filter(r => r.stage === stage);
    assert.ok(captured.length > 0);
    for (const record of captured) assert.deepEqual(record.data.nativeContract, contract);
  }
  assert.equal(await writer.drain(), true);
  const archived = await readArchive(writer.config.directory);
  assert.deepEqual(archived.issues, []);
  assert.ok(archived.records.every(r => r.schemaVersion === 4));
  const history = nativeHistory(archived.records);
  assert.deepEqual(history.contract, contract);
  assert.equal(history.requests.length, 4); assert.equal(history.responses.length, 4);
  assert.equal(history.metadata.length, 2); assert.equal(history.deterministic.length, 1);
  assert.deepEqual(history.requests[0].nativeRequest, fake.calls.find(c => c.path === '/completion').body);
  assert.equal(history.deterministic[0].modelConfidence, false);
  assert.equal(history.deterministic[0].authenticatedCoverage, false);
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
  assert.equal(restarted.status().judge.provider, 'typesafe');
  assert.equal(restarted.status().judge.reason, 'missing-credentials'); await restarted.close();
  await fsp.writeFile(file, JSON.stringify({ ...settings, forbidden: 'private-settings-canary' }), { mode: 0o600 });
  const invalid = createGuard({ host: 'archive-invalid', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' } });
  assert.equal(invalid.status().judge.provider, 'unknown'); assert.equal(invalid.status().judge.reason, 'configuration');
  const blocked = invalid.openSession({ sessionId: 'invalid', contextId: 'main' }, project);
  assert.equal((await blocked.ready).state, 'unavailable');
  const attempts = fake.calls.length;
  assert.equal((await blocked.beforeTool({ callId: 'bad', toolName: 'inert', input: {} })).permission, 'blocked');
  assert.equal(fake.calls.length, attempts); await invalid.close();
  let constructed = 0;
  const invalidInjected = createGuard({ host: 'archive-invalid-injected', env: { TENET_RECORDING: 'off' },
    createJudge: () => { constructed++; throw new Error('invalid settings must prevent construction'); } });
  assert.equal(invalidInjected.status().judge.reason, 'configuration');
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
