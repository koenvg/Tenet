import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, realpath, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readArchive, sessionKey, recordSessionKey, recordInvocationKey } from '../src/recording/archive.js';
import { ArchiveWriter } from './legacy-recording-fixture.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { invocationView } from '../src/inspector/view.js';
import { exchange, startBridge, writeLocalState } from '../src/claude/bridge.js';
import { answer } from './helpers.js';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mixed-')));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const common = { sessionId: 'same', invocationId: 'same', callId: 'same', toolName: 'Bash', cwd: '/tmp', mode: 'observe' as const };
async function registerSession(directory: string, sessionId: string, cwd: string) {
  const response = await exchange(directory, { version: 1, event: 'status', sessionId, contextId: 'main', cwd });
  assert.equal(response.decision, 'pass');
  assert.ok(response.generation);
  await writeLocalState(directory, sessionId, { cwd, eligible: true, generation: response.generation });
}

test('schema 1 links remain stable beside host/context qualified schema 2 and unsupported records stay visible', () => fixture(async root => {
  const writer = new ArchiveWriter({ enabled: true, directory: root });
  const old = writer.bind(common);
  old('begin', { policy: { rules: [] }, config: { effectThreshold: 0.83 } });
  old('decision', { decision: 'BLOCK' });
  for (const [host, contextId] of [['pi', 'main'], ['claude-code', 'main'], ['claude-code', 'child']] as const) {
    const sink = writer.bind({ ...common, host, contextId });
    sink('begin', { adapterCoverage: { limitations: ['host-version-unverified'], resultCorrelation: false } });
    sink('decision', { decision: 'ALLOW' });
    sink('permission', { outcome: 'released' });
  }
  await writer.close();
  const legacy = await readFile(join(root, sessionKey('same'), (await readdir(join(root, sessionKey('same'))))[0]!), 'utf8');
  const archive = await readArchive(root);
  assert.deepEqual(archive.issues, []);
  assert.equal(archive.records.filter(r => r.schemaVersion === 1).length, 2);
  assert.equal(archive.records.filter(r => r.schemaVersion === 3).length, 9);
  assert.equal(recordSessionKey(archive.records[0]!), sessionKey('same'));
  const index = new ArchiveIndex(root); await index.refresh();
  const sessions = index.sessions().items;
  assert.equal(sessions.length, 4);
  assert.equal(new Set(sessions.map(s => s.id)).size, 4);
  assert.equal(sessions.find(s => s.id === sessionKey('same'))?.host, 'pi');
  assert.equal(sessions.filter(s => s.host === 'claude-code').length, 2);
  const legacyCalls = index.invocations(sessionKey('same')).items;
  assert.equal(legacyCalls[0]?.id, sessionKey('same'));
  const oldView = invocationView((await index.detail(sessionKey('same'), sessionKey('same'))).records);
  assert.equal(oldView.rules.length, 0);
  assert.equal(oldView.config.effectThreshold, 0.83);
  for (const session of sessions.filter(s => s.id !== sessionKey('same'))) {
    const calls = index.invocations(session.id).items;
    assert.equal(calls.length, 1);
    assert.notEqual(calls[0]?.id, sessionKey('same'));
    assert.equal(calls[0]?.id, recordInvocationKey((await index.detail(session.id, calls[0]!.id)).records[0]!));
    const view = invocationView((await index.detail(session.id, calls[0]!.id)).records);
    assert.equal(view.identity?.host, session.host);
    assert.equal(view.identity?.contextId, session.contextId);
    assert.equal(view.execution, 'unknown');
    assert.equal(view.permission, 'released');
    assert.deepEqual(view.adapterCoverage?.limitations, ['host-version-unverified']);
  }
  assert.equal(await readFile(join(root, sessionKey('same'), (await readdir(join(root, sessionKey('same'))))[0]!), 'utf8'), legacy);
  const folder = join(root, sessions.find(s => s.host === 'claude-code')!.id);
  const file = (await readdir(folder))[0]!;
  await writeFile(join(folder, 'unsupported.json'), JSON.stringify({ schemaVersion: 4 }), { mode: 0o600 });
  await index.refresh();
  assert.ok(index.issues().some(i => i.reason === 'unsupported-schema'));
}));

test('Claude bridge records correlated success/failure, keeps missing results unknown and respects opt-out', () => fixture(async root => {
  const cwd = join(root, 'project'); await mkdir(cwd);
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Never publish.');
  const directory = join(root, 'bridge'), archive = join(root, 'archive');
  const env = { TENET_MODE: 'observe', TENET_RECORDING_DIR: archive, TENET_CONTROL_PATH: join(root, 'control.json') };
  const run = async (selectedEnv: Record<string, string>, sessionId: string) => {
    const server = await startBridge({ directory, env: selectedEnv, judge: async request => answer(request.policy) });
    try {
      const send = (event: 'start' | 'call' | 'result', callId?: string, isError?: boolean) => exchange(directory,
        { version: 1, event, sessionId, contextId: 'main', cwd, ...(callId ? { callId, toolName: 'Bash' } : {}),
          ...(event === 'call' ? { input: { command: 'echo ok', token: 'sensitive-123-xyz' } } : {}),
          ...(event === 'result' ? { content: { output: 'ok' }, isError } : {}) });
      await registerSession(directory, sessionId, cwd);
      await send('start');
      for (const call of ['success', 'failure', 'missing']) {
        assert.equal((await send('call', call)).decision, 'pass');
        if (call !== 'missing') assert.equal((await send('result', call, call === 'failure')).decision, 'pass');
      }
    } finally { await server.close(); }
  };
  await run(env, 'one');
  const rows = (await readArchive(archive)).records;
  assert.deepEqual(['executed', 'failed', 'unknown'].sort(), ['success', 'failure', 'missing'].map(callId =>
    invocationView(rows.filter(r => r.callId === callId)).execution).sort());
  assert.ok(rows.every(r => r.schemaVersion === 3 && r.host === 'claude-code'));
  assert.ok(!JSON.stringify(rows).includes('sensitive-123-xyz'));
  await run({ ...env, TENET_RECORDING: 'off' }, 'two');
  assert.ok((await readArchive(archive)).records.every(r => r.sessionId === 'one'));
}));

test('same Claude call ID in parent and child remains independently correlated', () => fixture(async root => {
  const cwd = join(root, 'project'); await mkdir(cwd);
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Never publish.');
  const archive = join(root, 'archive'), directory = join(root, 'bridge');
  const server = await startBridge({ directory, env: { TENET_MODE: 'observe', TENET_RECORDING_DIR: archive, TENET_CONTROL_PATH: join(root, 'control.json') },
    judge: async request => answer(request.policy) });
  try {
    await registerSession(directory, 'same', cwd);
    const send = (event: 'start' | 'call' | 'result', contextId: string, isError = false) => exchange(directory,
      { version: 1, event, sessionId: 'same', contextId, cwd, ...(event !== 'start' ? { callId: 'equal', toolName: 'Bash' } : {}),
        ...(event === 'call' ? { input: { command: 'echo ok' } } : {}), ...(event === 'result' ? { content: 'done', isError } : {}) });
    assert.equal((await send('start', 'main')).decision, 'pass');
    assert.equal((await send('call', 'main')).decision, 'pass');
    assert.equal((await send('call', 'child')).decision, 'pass');
    await send('result', 'child', true);
    await send('result', 'main', false);
  } finally { await server.close(); }
  const records = (await readArchive(archive)).records;
  const index = new ArchiveIndex(archive); await index.refresh();
  const sessions = index.sessions().items;
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map(s => s.contextId).sort(), ['child', 'main']);
  assert.deepEqual(sessions.map(s => index.invocations(s.id).items[0]?.execution).sort(), ['executed', 'failed']);
  assert.deepEqual(records.filter(r => r.stage === 'execution').map(r => r.data.outcome).sort(), ['executed', 'failed']);
}));

test('off, dormant and failing archive paths never change a valid Claude permission', () => fixture(async root => {
  const cwd = join(root, 'project'); await mkdir(cwd);
  await writeFile(join(cwd, 'TENET.md'), 'Rule; BLOCK; Never publish.');
  const directory = join(root, 'bridge'), archive = join(root, 'archive');
  const env = { TENET_MODE: 'observe', TENET_RECORDING_DIR: archive, TENET_CONTROL_PATH: join(root, 'control.json') };
  await writeFile(archive, 'not a directory');
  const server = await startBridge({ directory, env, judge: async request => answer(request.policy) });
  try {
    const start = (sessionId: string) => exchange(directory, { version: 1, event: 'start', sessionId, contextId: 'main', cwd });
    const call = (sessionId: string) => exchange(directory, { version: 1, event: 'call', sessionId, contextId: 'main', cwd, callId: 'c', toolName: 'Bash', input: {} });
    await writeLocalState(directory, 'dormant', { cwd, eligible: false });
    assert.equal((await start('dormant')).decision, 'deny');
    await registerSession(directory, 'off', cwd);
    assert.equal((await start('off')).decision, 'pass');
    const { ActivationStore } = await import('../src/runtime/activation.js');
    await new ActivationStore(env.TENET_CONTROL_PATH).write('off');
    assert.equal((await call('off')).decision, 'pass');
    await new ActivationStore(env.TENET_CONTROL_PATH).write('on');
    await registerSession(directory, 'failed', cwd);
    await start('failed');
    assert.equal((await call('failed')).decision, 'pass');
  } finally { await server.close(); }
  assert.deepEqual((await readArchive(archive)).records.filter(r => r.sessionId === 'off' || r.sessionId === 'dormant'), []);
}));
