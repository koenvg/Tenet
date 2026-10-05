import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveWriter, readArchive, qualifiedSessionKey, recordInvocationKey, sessionKey } from '../src/recording/archive.js';
import { SCHEMA_VERSION } from '../src/recording/contract.js';
import { UNAVAILABLE_EVIDENCE_CONTEXT } from '../src/decision/evidence-context.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { invocationView } from '../src/inspector/view.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { HistoricalArchiveWriter } from './legacy-recording-fixture.js';

const identity = { sessionId: 'recorded', invocationId: 'call', callId: 'call', toolName: 'edit', cwd: '/absent-policy', mode: 'observe' as const };
const qualified = { ...identity, host: 'pi', contextId: 'main' };
const request = { payload: { model: 'recorded-model', questions: { original: { instructions: 'recorded instructions' } },
  state: { action: { retained: 'literal' }, policy: { rules: [] }, context: {}, trajectory: {}, integrity: {} } },
  policy: { rules: [] }, mapping: [], questionVersion: 'recorded-question-version' };

async function temporary(run: (directory: string) => Promise<void>) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'tenet-fixture-versions-')));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

for (const schema of [1, 2, 3, 4] as const) {
  test(`explicit schema ${schema} retains recorded bytes, identities, payload and thresholds`, () => temporary(async directory => {
    const historical = new HistoricalArchiveWriter({ enabled: true, directory });
    const current = new ArchiveWriter({ enabled: true, directory });
    const sink = schema === 1 ? historical.bindHistorical(identity, 1)
      : schema === 2 ? historical.bindHistorical(qualified, 2)
      : schema === 3 ? historical.bindHistorical({ ...qualified, bbThreadId: 'thr_abcdefgh1234' }, 3)
      : current.bind(qualified);
    sink('begin', { config: { effectThreshold: .73, evidenceThreshold: .81 }, policy: request.policy });
    sink('request', request);
    await Promise.all([historical.close(), current.close()]);
    const session = schema === 1 ? sessionKey(identity.sessionId) : qualifiedSessionKey('pi', identity.sessionId, 'main');
    const folder = join(directory, session);
    const files = await readdir(folder);
    const before = await Promise.all(files.map(file => readFile(join(folder, file), 'utf8')));
    const archive = await readArchive(directory);
    assert.deepEqual(archive.issues, []);
    assert.equal(archive.records.length, 2);
    assert.ok(archive.records.every(record => record.schemaVersion === schema));
    const index = new ArchiveIndex(directory); await index.refresh();
    const invocation = schema === 1 ? sessionKey(identity.invocationId) : recordInvocationKey({ ...qualified, schemaVersion: schema });
    assert.equal(index.invocations(session).items[0]?.id, invocation);
    const detail = await index.detail(session, invocation);
    const view = invocationView(detail.records);
    assert.equal(view.config.effectThreshold, .73);
    assert.equal(view.config.evidenceThreshold, .81);
    assert.equal(view.questionVersion, request.questionVersion);
    assert.deepEqual(view.evidence, request.payload.state);
    assert.deepEqual(archive.records.find(record => record.stage === 'request')!.data.payload, request.payload);
    assert.deepEqual(view.evidenceContext, schema === 4 ? UNAVAILABLE_EVIDENCE_CONTEXT : null);
    assert.equal(archive.records[0]?.bbThreadId, schema === 3 ? 'thr_abcdefgh1234' : undefined);
    assert.deepEqual(await Promise.all(files.map(file => readFile(join(folder, file), 'utf8'))), before);
  }));
}

test('fixture entry points reject implicit versions and incompatible host metadata', () => temporary(async directory => {
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  // @ts-expect-error Current fixtures require production host identity.
  assert.throws(() => writer.bind(identity), /invalid-recording-identity/);
  // @ts-expect-error Schema 1 must not acquire host-qualified identity.
  assert.throws(() => writer.bindHistorical(qualified, 1), /invalid-historical-recording-identity/);
  // @ts-expect-error Schema 2 cannot record a BB thread association.
  assert.throws(() => writer.bindHistorical({ ...qualified, bbThreadId: 'thr_abcdefgh1234' }, 2), /invalid-historical-recording-identity/);
  // @ts-expect-error Historical entry points do not select the current writer contract.
  assert.throws(() => writer.bindHistorical(qualified, 4), /invalid-historical-recording-identity/);
  writer.bind(qualified)('begin', {});
  writer.bind({ ...qualified, invocationId: 'linked', bbThreadId: 'thr_abcdefgh1234' })('begin', {});
  await writer.complete();
  const archive = await readArchive(directory);
  assert.deepEqual(archive.issues, []);
  assert.equal(archive.records.length, 2);
  assert.ok(archive.records.every(record => record.schemaVersion === SCHEMA_VERSION));
}));

test('current request capture exposes invalid provenance instead of falling back to a historical schema', () => temporary(async directory => {
  const writer = new ArchiveWriter({ enabled: true, directory });
  writer.bind(qualified)('request', request);
  for (const [index, data] of [
    { evidenceContext: null },
    { evidenceContext: { ...UNAVAILABLE_EVIDENCE_CONTEXT, selectionVersion: 'unknown' } },
    { selectionVersion: 'unknown' },
  ].entries()) writer.bind({ ...qualified, invocationId: `invalid-${index}` })('request', { ...request, ...data });
  await writer.close();
  const archive = await readArchive(directory);
  assert.equal(archive.records.length, 1);
  assert.equal(archive.records[0]?.schemaVersion, SCHEMA_VERSION);
  assert.equal(archive.records[0]?.invocationId, identity.invocationId);
  assert.deepEqual(archive.issues.map(issue => issue.reason), Array(3).fill('corrupt-record'));
}));
