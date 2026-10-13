import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invocationView } from '../src/inspector/view.js';
import { validRecord, type ArchiveRecord } from '../src/recording/contract.js';

for (const version of ['apus-recording-v1', 'apus-recording-v2'] as const) {
  const nativeContract = { version, renderingVersion: 'jev.dynamic.prompt.v2',
    rendererRevision: '7389d774472c9e29ddc84fffb392951f0f25de74', protocolVersion: 'llamacpp-b11118-choice-v1' };
  const scope = version === 'apus-recording-v2' ? { scopeId: 'ordinary:0' } : {};
  const values = [
    { provider: 'apus-llamacpp', kind: 'native-request', question: 'rule_0_outcome', ...scope,
      renderingVersion: nativeContract.renderingVersion, chat: 'synthetic prompt',
      mapping: { A: 'PASS', B: 'FAIL' }, labelIds: { A: 32, B: 33 }, nativeRequest: { prompt: [1, 2] } },
    { provider: 'apus-llamacpp', kind: 'native-response', question: 'rule_0_outcome', ...scope,
      raw: { completion_probabilities: [] } },
    { provider: 'apus-llamacpp', derivation: 'sole-allowed-facts-selector', question: 'rule_0_exemption', ...scope,
      modelConfidence: false, authenticatedCoverage: false, nativeScoringRequests: 0,
      criteria: [{ id: 'NONE' }], answer: { choice: 'NONE', probabilities: { NONE: 1 } } },
    { provider: 'apus-llamacpp', kind: 'metadata', phase: 'before', identity: { model: 'synthetic-model' } },
  ];

  function records(markers: Record<string, unknown>): ArchiveRecord[] {
    return values.map((value, index) => ({
      schemaVersion: version === 'apus-recording-v1' ? 4 : 5,
      host: 'offline', contextId: 'main', sessionId: 'synthetic', invocationId: 'native',
      callId: 'native', toolName: 'inert', cwd: '/synthetic', mode: 'observe',
      writerId: '00000000-0000-4000-8000-000000000001', sequence: index + 1,
      eventId: `00000000-0000-4000-8000-00000000000${index + 2}`, timestamp: 1, stage: 'response',
      data: { nativeContract, untrusted: true, bytes: Buffer.byteLength(JSON.stringify(value)),
        omittedFields: 2, truncated: false, value, ...markers },
    }));
  }

  for (const [name, markers, available] of [
    ['available without unavailable marker', {}, true],
    ['explicitly available', { unavailable: false }, true],
    ['unavailable with retained value', { unavailable: true, reason: 'synthetic-omission' }, false],
    ['truncated with retained value', { truncated: true, preview: 'synthetic-preview' }, false],
    ['unavailable and truncated', { unavailable: true, truncated: true, preview: 'synthetic-preview' }, false],
  ] as const) test(`${version} native history honors ${name}`, () => {
    const captured = records(markers);
    const before = JSON.stringify(captured);
    for (const record of captured) assert.equal(validRecord(record), true);
    const native = invocationView(captured).native!;
    assert.equal(native.contract.version, version);
    assert.deepEqual(native.requests, available ? [values[0]] : []);
    assert.deepEqual(native.responses, available ? [values[1]] : []);
    assert.deepEqual(native.deterministic, available ? [values[2]] : []);
    assert.deepEqual(native.metadata, available ? [values[3]] : []);
    assert.deepEqual(native.omissions, available ? [] : captured.map(r => r.data));
    assert.deepEqual(native.snapshots, captured.map(r => r.data));
    assert.equal(JSON.stringify(captured), before);
  });

  test(`${version} unavailable native values do not need valid provenance to remain omissions`, () => {
    const captured = records({ unavailable: true, reason: 'synthetic-invalid-value' });
    for (const record of captured) {
      record.data.value = { kind: 'native-request', derivation: 'sole-allowed-facts-selector' };
      assert.equal(validRecord(record), true);
    }
    const native = invocationView(captured).native!;
    assert.deepEqual([native.requests, native.responses, native.deterministic, native.metadata], [[], [], [], []]);
    assert.deepEqual(native.omissions, captured.map(r => r.data));
  });
}
