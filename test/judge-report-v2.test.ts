import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGuard, type OwnerReport } from '../src/sdk/index.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { recordedJudgeReport } from '../src/recording/judge.js';
import { readArchive } from '../src/recording/archive.js';
import { validRecord, type ArchiveRecord } from '../src/recording/contract.js';
import { invocationView } from '../src/inspector/view.js';
import { answer, policy, sdkAnswers } from './helpers.js';

const descriptor = {
  judgeReportVersion: 'judge-report-v2', requestedProvider: 'system-one', requestedModel: 'kev-latest',
  requestedDestination: 'http://127.0.0.1:8088', transportContract: 'system-one-v1', authentication: 'none',
};

test('v2 validates canonical transport descriptors without changing v1 interpretation', () => {
  assert.deepEqual(recordedJudgeReport(descriptor), descriptor);
  for (const fields of [
    { requestedProvider: 'typesafe' }, { requestedDestination: 'http://127.0.0.1:8088/' },
    { requestedDestination: 'https://user:secret@example.com' }, { authentication: 'TOKEN_NAME' },
    { transportContract: 'llamacpp-b11118-choice-v1' }, { requestedDestination: null },
    { requestedDestination: 'https://example.com' }, { returnedModel: '' },
  ]) assert.equal(recordedJudgeReport({ ...descriptor, ...fields }), undefined);
  for (const requestedProvider of ['typesafe', 'apus-llamacpp', 'injected', 'unknown']) {
    const historical = { judgeReportVersion: 'judge-report-v1', requestedProvider, requestedModel: 'old', returnedModel: 'old-returned' };
    assert.deepEqual(recordedJudgeReport({ ...historical, requestedDestination: 'ignored-current-origin' }), historical);
  }
  assert.equal(recordedJudgeReport({ requestedProvider: 'typesafe' }), undefined);
});

test('schemas 1-5 retain recorded identity and absent destination without reading settings', () => {
  for (const schemaVersion of [1, 2, 3, 4, 5] as const) for (const identity of [
    {}, { judgeReportVersion: 'judge-report-v1', requestedProvider: 'typesafe', requestedModel: 'old-requested' },
    { judgeReportVersion: 'judge-report-v1', requestedProvider: 'apus-llamacpp', requestedModel: 'old-apus' }, descriptor,
  ]) {
    const record = { schemaVersion, ...(schemaVersion > 1 ? { host: 'offline', contextId: 'main' } : {}),
      sessionId: 's', invocationId: 'i', callId: 'c', toolName: 'inert', cwd: '/synthetic', mode: 'observe',
      writerId: '00000000-0000-4000-8000-000000000001', eventId: '00000000-0000-4000-8000-000000000002',
      sequence: 1, timestamp: 1, stage: 'begin', data: { policy, ...identity } } as ArchiveRecord;
    const before = JSON.stringify(record);
    assert.equal(validRecord(record), true);
    const judge = invocationView([record]).judge;
    assert.equal(judge.provider, 'requestedProvider' in identity ? identity.requestedProvider : null);
    assert.equal(judge.requestedDestination, identity === descriptor ? descriptor.requestedDestination : null);
    assert.equal(JSON.stringify(record), before);
  }
});

for (const failure of [false, true]) test(`configured SDK v2 ${failure ? 'failure' : 'success'} round trip records project provenance`, async () => {
  const cwd = await realpath(await mkdtemp('/tmp/tenet-v2-'));
  const originalFetch = globalThis.fetch;
  const reports: OwnerReport[] = [];
  let requests = 0;
  const guard = createGuard({ host: 'offline', capabilities: ['interception', 'argument-stability', 'lifecycle-invalidation'],
    env: { TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_RECORDING_DIR: join(cwd, 'archive'),
      TENET_JUDGE_DEADLINE_MS: '5000', CUSTOM_TOKEN: 'credential-sentinel' },
    observationLimits: { running: 3 }, controlPath: join(cwd, 'control.json'),
    onOwnerEvent: e => { if (e.type === 'permission' && e.report) reports.push(e.report); } });
  try {
    await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
    await mkdir(join(cwd, '.tenet'), { mode: 0o700 });
    await writeFile(join(cwd, '.tenet/config.json'), JSON.stringify({ version: 2,
      judge: { protocol: 'system-one', baseUrl: 'https://EXAMPLE.com:443/', model: 'kev-latest', auth: { type: 'bearer-env', name: 'CUSTOM_TOKEN' } },
      observation: { waiting: 7 }, decision: { deadlineMs: 1000 } }));
    await chmod(join(cwd, '.tenet/config.json'), 0o600);
    globalThis.fetch = async (_url, init) => {
      requests++;
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer credential-sentinel');
      if (failure) return new Response('private-error-body', { status: 503 });
      const body = JSON.parse(init!.body as string);
      return Response.json({ model: 'kev-returned', answers: sdkAnswers(answer(policy), 1, body.questions) });
    };
    const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd);
    const ready = await session.ready;
    assert.equal(ready.judge.provider, 'system-one');
    assert.equal(ready.judge.requestedDestination, 'https://example.com');
    assert.deepEqual(ready.configuration.sources, { judge: 'project', deadlineMs: 'environment',
      observation: { running: 'sdk', waiting: 'project', bytes: 'default', ageMs: 'default' } });
    const call = { callId: 'c', toolName: 'fixture-only', input: {} };
    const result = await session.beforeTool({ ...call, current: () => ({ sessionId: 's', contextId: 'main', ...call }) });
    assert.equal(result.assessment.status, failure ? 'unavailable' : 'completed');
    await guard.close();
    await writeFile(join(cwd, '.tenet/config.json'), JSON.stringify({ version: 2,
      judge: { protocol: 'system-one', baseUrl: 'http://127.0.0.1:9999', model: 'changed-current', auth: { type: 'none' } } }));
    const changed = createGuard({ host: 'offline', env: { TENET_RECORDING: 'off' }, controlPath: join(cwd, 'other-control.json') });
    try {
      assert.equal((await changed.openSession({ sessionId: 'changed', contextId: 'main' }, cwd).ready).judge.requestedDestination, 'http://127.0.0.1:9999');
    } finally { await changed.close(); }
    const archive = await readArchive(join(cwd, 'archive'));
    assert.deepEqual(archive.issues, []);
    assert.equal(archive.records.find(r => r.stage === 'request')!.data.provider, 'system-one');
    for (const record of archive.records.filter(r => ['begin', 'assessment', 'decision', 'permission', 'assessment-status'].includes(r.stage))) {
      const report = recordedJudgeReport(record.data)!;
      assert.equal(report.judgeReportVersion, 'judge-report-v2');
      assert.equal(report.requestedDestination, 'https://example.com');
      assert.equal(report.authentication, 'bearer-env');
      assert.deepEqual(record.data.configuration, ready.configuration);
      assert.equal(record.schemaVersion, 5);
      if (failure) assert.equal(report.returnedModel, undefined);
    }
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0]!.configuration, ready.configuration);
    const recorded = invocationView(archive.records);
    assert.equal(recorded.judge.requestedDestination, 'https://example.com');
    assert.deepEqual(recorded.judge.configuration, ready.configuration);
    assert.equal(reports[0]!.returnedModel, failure ? undefined : 'kev-returned');
    assert.equal(reports[0]!.requestedModel, 'kev-latest');
    assert.equal(reports[0]!.requestedDestination, 'https://example.com');
    assert.equal(requests, failure ? 1 : 3);
    assert.doesNotMatch(JSON.stringify([archive, reports, ready]), /credential-sentinel|CUSTOM_TOKEN|private-error-body/);
  } finally { globalThis.fetch = originalFetch; await guard.close(); await rm(cwd, { recursive: true, force: true }); }
});

for (const selection of ['missing-credentials', 'invalid-settings', 'anonymous', 'injected'] as const) {
  test(`v2 ${selection} preserves only the effective requested identity before response`, async () => {
    const cwd = await realpath(await mkdtemp('/tmp/tenet-v2-unavailable-'));
    const records: { stage: string; data: Record<string, unknown> }[] = [];
    const reports: OwnerReport[] = [];
    let requests = 0;
    const originalFetch = globalThis.fetch;
    try {
      await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
      await mkdir(join(cwd, '.tenet'), { mode: 0o700 });
      await writeFile(join(cwd, '.tenet/config.json'), JSON.stringify({ version: 2, judge: {
        protocol: 'system-one', model: 'kev-latest', baseUrl: selection === 'invalid-settings' ? 'https://user:rejected-url@example.com/path' : 'http://127.0.0.1:8088/',
        auth: selection === 'missing-credentials' ? { type: 'bearer-env', name: 'CUSTOM_TOKEN' } : { type: 'none' },
      } }), { mode: 0o600 });
      globalThis.fetch = async () => { requests++; return new Response('private-error-body', { status: 503 }); };
      const guard = createGuard({ host: 'offline', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
        capabilities: ['interception', 'argument-stability', 'lifecycle-invalidation'], controlPath: join(cwd, 'control.json'),
        bindRecording: () => (stage, data) => { records.push({ stage, data }); },
        ...(selection === 'injected' ? { judge: async () => { throw new Error('private-error-body'); } } : {}),
        onOwnerEvent: e => { if (e.type === 'permission' && e.report) reports.push(e.report); } });
      try {
        const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd);
        const ready = await session.ready;
        const call = { callId: 'c', toolName: 'inert', input: {} };
        await session.beforeTool({ ...call, current: () => ({ sessionId: 's', contextId: 'main', ...call }) });
        const expected = selection === 'invalid-settings' ? { provider: 'unknown', destination: null, authentication: null, source: null }
          : selection === 'injected' ? { provider: 'injected', destination: null, authentication: null, source: 'sdk' }
          : { provider: 'system-one', destination: 'http://127.0.0.1:8088', authentication: selection === 'anonymous' ? 'none' : 'bearer-env', source: 'project' };
        assert.equal(ready.judge.provider, expected.provider);
        assert.equal(ready.judge.requestedDestination, expected.destination);
        assert.equal(ready.configuration.sources.judge, expected.source);
        assert.equal(reports.length, 1);
        assert.equal(reports[0]!.configuration?.sources.judge, expected.source);
        for (const record of records.filter(r => ['begin', 'assessment', 'decision', 'permission', 'assessment-status'].includes(r.stage))) {
          const identity = recordedJudgeReport(record.data)!;
          assert.ok(identity);
          assert.equal(identity.judgeReportVersion, 'judge-report-v2');
          assert.equal(identity.requestedDestination, expected.destination);
          assert.equal(identity.authentication, expected.authentication);
          assert.equal(identity.returnedModel, undefined);
        }
        assert.equal(requests, selection === 'anonymous' ? 1 : 0);
        assert.doesNotMatch(JSON.stringify([ready, records, reports]), /rejected-url|CUSTOM_TOKEN|private-error-body/);
      } finally { await guard.close(); }
    } finally { globalThis.fetch = originalFetch; await rm(cwd, { recursive: true, force: true }); }
  });
}

test('historical archive schemas and v1 identities round trip unchanged after current settings change', async () => {
  const directory = await realpath(await mkdtemp('/tmp/tenet-v2-history-'));
  const writer = new FixtureArchiveWriter({ enabled: true, directory: join(directory, 'archive') });
  try {
    for (const schemaVersion of [1, 2, 3, 4, 5] as const) for (const provider of ['typesafe', 'apus-llamacpp', 'absent'] as const) {
      const identity = { sessionId: `s-${schemaVersion}-${provider}`, invocationId: 'i', callId: 'c', toolName: 'inert', cwd: directory, mode: 'observe' as const };
      const qualified = { ...identity, host: 'offline', contextId: 'main' };
      const sink = schemaVersion === 1 ? writer.bindHistorical(identity, 1) : schemaVersion === 5 ? writer.bind(qualified) : schemaVersion === 2 ? writer.bindHistorical(qualified, 2) : writer.bindHistorical(qualified, schemaVersion);
      sink('begin', { policy, ...(provider !== 'absent' ? { judgeReportVersion: 'judge-report-v1', requestedProvider: provider,
        requestedModel: 'historical-requested', returnedModel: 'historical-returned' } : {}) });
    }
    await writer.complete();
    const before = await readArchive(join(directory, 'archive'));
    assert.deepEqual(before.issues, []);
    assert.equal(before.records.length, 15);
    await mkdir(join(directory, '.tenet'), { mode: 0o700 });
    await writeFile(join(directory, '.tenet/config.json'), JSON.stringify({ version: 2,
      judge: { protocol: 'system-one', baseUrl: 'http://127.0.0.1:9999', model: 'current-kev', auth: { type: 'none' } } }), { mode: 0o600 });
    const guard = createGuard({ host: 'offline', env: { TENET_RECORDING: 'off' }, controlPath: join(directory, 'control.json') });
    try {
      const current = await guard.openSession({ sessionId: 'current', contextId: 'main' }, directory).ready;
      assert.equal(current.judge.requestedDestination, 'http://127.0.0.1:9999');
      const after = await readArchive(join(directory, 'archive'));
      assert.deepEqual(after, before);
      for (const record of after.records) {
        const view = invocationView([record]);
        assert.equal(view.judge.requestedDestination, null);
        assert.equal(view.judge.authentication, null);
        assert.equal(view.judge.configuration, null);
        assert.equal(view.judge.requestedModel, record.data.requestedModel ?? null);
        assert.deepEqual(recordedJudgeReport(record.data), record.data.requestedProvider ? {
          judgeReportVersion: 'judge-report-v1', requestedProvider: record.data.requestedProvider,
          requestedModel: 'historical-requested', returnedModel: 'historical-returned',
        } : undefined);
      }
    } finally { await guard.close(); }
  } finally { await writer.close(); await rm(directory, { recursive: true, force: true }); }
});

for (const protocol of ['system-one', 'apus-llamacpp'] as const) for (const hostname of ['127.0.0.1', '[::1]']) {
  test(`${protocol} canonical port-80 ${hostname} unavailable archive round trips`, async () => {
    const cwd = await realpath(await mkdtemp('/tmp/tenet-v2-port80-'));
    const originalFetch = globalThis.fetch;
    let requests = 0;
    try {
      await writeFile(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
      await mkdir(join(cwd, '.tenet'), { mode: 0o700 });
      await writeFile(join(cwd, '.tenet/config.json'), JSON.stringify({ version: 2, judge: {
        protocol, baseUrl: `http://${hostname}:80`, model: protocol === 'system-one' ? 'kev-latest' : 'apus-openjev-v1-4b-q8',
        ...(protocol === 'system-one' ? { auth: { type: 'none' } } : {}),
      } }), { mode: 0o600 });
      globalThis.fetch = async () => { requests++; return new Response('private-port80-error', { status: 503 }); };
      const guard = createGuard({ host: 'offline', env: { TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_RECORDING_DIR: join(cwd, 'archive') },
        capabilities: ['interception', 'argument-stability', 'lifecycle-invalidation'], controlPath: join(cwd, 'control.json') });
      try {
        const session = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd);
        const ready = await session.ready;
        assert.equal(ready.state, 'ready');
        assert.equal(ready.judge.requestedDestination, `http://${hostname}`);
        const call = { callId: 'c', toolName: 'inert', input: {} };
        assert.equal((await session.beforeTool({ ...call, current: () => ({ sessionId: 's', contextId: 'main', ...call }) })).assessment.status, 'unavailable');
        await guard.close();
        const archive = await readArchive(join(cwd, 'archive'));
        assert.deepEqual(archive.issues, []);
        const reports = archive.records.filter(r => r.data.judgeReportVersion !== undefined);
        assert.ok(reports.length >= 4);
        for (const r of reports) {
          const report = recordedJudgeReport(r.data)!;
          assert.equal(report.judgeReportVersion, 'judge-report-v2');
          assert.equal(report.requestedDestination, `http://${hostname}`);
          assert.equal(report.returnedModel, undefined);
        }
        const view = invocationView(archive.records);
        assert.equal(view.judge.requestedDestination, `http://${hostname}`);
        assert.equal(view.judge.experimental, protocol === 'apus-llamacpp' ? true : null);
        if (protocol === 'apus-llamacpp') assert.equal(view.native!.contract.version, 'apus-recording-v2');
        assert.equal(requests, 1);
        assert.doesNotMatch(JSON.stringify(archive), /private-port80-error/);
      } finally { await guard.close(); }
    } finally { globalThis.fetch = originalFetch; await rm(cwd, { recursive: true, force: true }); }
  });
}

test('v2 archive validators reject nonscalar identity and configuration enums', () => {
  const configuration = { source: '~/.tenet/config.json', settings: 'valid', availability: 'unavailable',
    deadlineMs: null, observation: null, sources: { judge: 'owner', deadlineMs: 'default', observation: null } };
  const record = { schemaVersion: 5, host: 'offline', contextId: 'main', sessionId: 's', invocationId: 'i', callId: 'c', toolName: 'inert',
    cwd: '/synthetic', mode: 'observe', writerId: '00000000-0000-4000-8000-000000000001', eventId: '00000000-0000-4000-8000-000000000002',
    sequence: 1, timestamp: 1, stage: 'begin', data: { policy, ...descriptor, configuration } };
  assert.equal(validRecord(record), true);
  for (const field of ['requestedProvider', 'authentication', 'transportContract']) for (const wrong of [[record.data[field as keyof typeof record.data]], {}, 1, true, null]) {
    assert.equal(validRecord({ ...record, data: { ...record.data, [field]: wrong } }), false, field);
  }
  assert.equal(validRecord({ ...record, data: { ...record.data, requestedDestination: 'https://example.com', authentication: ['none'] } }), false);
  for (const field of ['source', 'settings', 'availability', 'reason']) for (const wrong of [[field === 'reason' ? 'schema' : configuration[field as keyof typeof configuration]], {}, 1, true, null]) {
    assert.equal(validRecord({ ...record, data: { ...record.data, configuration: { ...configuration, [field]: wrong } } }), false, field);
  }
  for (const field of ['judge', 'deadlineMs']) for (const wrong of [['project'], {}, 1, true]) {
    assert.equal(validRecord({ ...record, data: { ...record.data, configuration: { ...configuration, sources: { ...configuration.sources, [field]: wrong } } } }), false, field);
  }
  const readyConfiguration = { ...configuration, availability: 'ready', deadlineMs: 5000,
    observation: { running: 2, waiting: 32, bytes: 1048576, ageMs: 5000 },
    sources: { judge: 'project', deadlineMs: 'default', observation: { running: 'default', waiting: 'default', bytes: 'default', ageMs: 'default' } } };
  assert.equal(validRecord({ ...record, data: { ...record.data, configuration: readyConfiguration } }), true);
  for (const field of ['running', 'waiting', 'bytes', 'ageMs']) for (const wrong of [['sdk'], {}, 1, true, null]) {
    assert.equal(validRecord({ ...record, data: { ...record.data, configuration: { ...readyConfiguration,
      sources: { ...readyConfiguration.sources, observation: { ...readyConfiguration.sources.observation, [field]: wrong } } } } }), false, field);
  }
  for (const wrong of [['none'], {}, 1, true]) {
    assert.equal(recordedJudgeReport({ ...descriptor, authentication: wrong }), undefined);
  }
});
