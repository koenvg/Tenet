import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readOwnerSettings } from '../src/runtime/settings.js';
import { prepareConfiguration } from '../src/runtime/configuration.js';
import { createGuard } from '../src/sdk/index.js';
import { answer } from './helpers.js';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { guardHarness } from './guard-harness.js';
import { scriptedNative } from './apus-scripted.js';

const typesafe = { version: 1, judge: { provider: 'typesafe' } };
const apus = { version: 1, judge: { provider: 'apus-llamacpp', baseUrl: 'http://127.0.0.1:8088', model: 'apus-openjev-v1-4b-q8' },
  decision: { deadlineMs: 120000 }, observation: { running: 1, waiting: 8, bytes: 1048576, ageMs: 120000 } };
function fixture(work: (home: string, file: string) => void) {
  const home = realpathSync(mkdtempSync('/tmp/tenet-settings-'));
  mkdirSync(join(home, '.tenet'), { mode: 0o700 });
  try { work(home, join(home, '.tenet/config.json')); } finally { rmSync(home, { recursive: true, force: true }); }
}
const put = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
const changed = (info: ReturnType<typeof lstatSync>, values: object) => Object.assign(Object.create(Object.getPrototypeOf(info)), info, values);
test('absent settings and both closed providers', () => fixture((home, file) => {
  assert.equal(readOwnerSettings(home).state, 'absent');
  for (const value of [typesafe, apus]) {
    put(file, value); const selected = readOwnerSettings(home);
    assert.equal(selected.state, 'valid');
    if (selected.state === 'valid') { assert.deepEqual(selected.value, value); assert.ok(Object.isFrozen(selected.value.judge)); }
  }
  rmSync(file); rmSync(join(home, '.tenet'), { recursive: true });
  assert.equal(readOwnerSettings(home).state, 'absent');
  assert.throws(() => lstatSync(join(home, '.tenet')), { code: 'ENOENT' });
}));
for (const state of ['absent', 'valid'] as const) {
  for (const churn of ['creation', 'removal'] as const) {
    test(`unrelated sibling directory ${churn} preserves ${state} owner settings`, () => fixture((home, file) => {
      if (state === 'valid') put(file, typesafe);
      const sibling = join(home, 'sibling');
      if (churn === 'removal') mkdirSync(sibling);
      const before = lstatSync(home);
      let churned = false;
      const io = { closeSync, fstatSync, openSync, readSync, lstatSync: ((path: string) => {
        if (path === file && !churned) {
          if (churn === 'creation') mkdirSync(sibling); else rmSync(sibling, { recursive: true });
          churned = true;
        }
        const info = lstatSync(path);
        // Model child-directory link counts on filesystems that do not report them.
        return path === home && churned ? changed(info, { nlink: before.nlink + (churn === 'creation' ? 1 : -1) }) : info;
      }) as typeof lstatSync };
      assert.deepEqual(readOwnerSettings(home, io), state === 'absent' ? { state: 'absent' } : { state: 'valid', value: typesafe });
      assert.ok(churned);
    }));
  }
}
for (const state of ['absent', 'valid'] as const) {
  for (const replacement of ['directory', 'symlink'] as const) {
    test(`ancestor ${replacement} replacement rejects ${state} owner settings`, () => fixture((home, file) => {
      if (state === 'valid') put(file, typesafe);
      const root = join(home, '.tenet'), retired = join(home, 'retired');
      let replaced = false;
      const io = { closeSync, fstatSync, openSync, readSync, lstatSync: ((path: string) => {
        if (path === file && !replaced) {
          renameSync(root, retired);
          if (replacement === 'symlink') symlinkSync(retired, root);
          else { mkdirSync(root, { mode: 0o700 }); if (state === 'valid') put(file, typesafe); }
          replaced = true;
        }
        return lstatSync(path);
      }) as typeof lstatSync };
      assert.deepEqual(readOwnerSettings(home, io), { state: 'invalid', reason: 'unsafe' });
      assert.ok(replaced);
    }));
  }
  test(`ancestor security metadata changes reject ${state} owner settings`, () => fixture((home, file) => {
    if (state === 'valid') put(file, typesafe);
    for (const target of [home, join(home, '.tenet')]) {
      const before = lstatSync(target);
      for (const change of [{ dev: before.dev + 1 }, { ino: before.ino + 1 }, { uid: before.uid + 1 }, { mode: before.mode ^ 0o020 }]) {
        let selected = false;
        const io = { closeSync, fstatSync, openSync, readSync, lstatSync: ((path: string) => {
          if (path === file) selected = true;
          const info = lstatSync(path);
          return selected && path === target ? changed(info, change) : info;
        }) as typeof lstatSync };
        assert.deepEqual(readOwnerSettings(home, io), { state: 'invalid', reason: 'unsafe' });
      }
    }
  }));
}
for (const stage of ['before open', 'during read', 'final path lookup'] as const) {
  test(`config-file hard-link race ${stage} is rejected`, () => fixture((home, file) => {
    put(file, typesafe);
    let linked = false, lookups = 0, closed = 0;
    const link = () => { if (!linked) { linkSync(file, join(home, 'hard')); linked = true; } };
    const io = {
      fstatSync,
      lstatSync: ((path: string) => {
        if (path === file && ++lookups === 2 && stage === 'final path lookup') link();
        return lstatSync(path);
      }) as typeof lstatSync,
      openSync: ((path: string, flags: number) => { if (stage === 'before open') link(); return openSync(path, flags); }) as typeof openSync,
      readSync: ((...args: Parameters<typeof readSync>) => { if (stage === 'during read') link(); return readSync(...args); }) as typeof readSync,
      closeSync: (fd: number) => { closed++; closeSync(fd); },
    };
    assert.deepEqual(readOwnerSettings(home, io), { state: 'invalid', reason: 'unsafe' });
    assert.ok(linked); assert.equal(closed, 1);
  }));
}
test('strict types, keys, aliases, destination and timer bounds', () => fixture((home, file) => {
  const bad = [null, [], {}, { ...typesafe, version: 2 }, { ...typesafe, version: '1' }, { version: 1 },
    ...['credentials', 'activation', 'mode', 'policy', 'thresholds', 'capture'].map(key => ({ ...typesafe, [key]: 'forbidden' })),
    { ...typesafe, judge: { provider: 'typesafe', baseUrl: 'http://127.0.0.1:8088' } },
    { ...typesafe, judge: { provider: 'typesafe', apiKey: 'fixture-secret' } },
    { ...typesafe, judge: { provider: 'other' } }, { ...typesafe, judge: null },
    ...['https://127.0.0.1:8088', 'http://localhost:8088', 'http://127.1:8088', 'http://2130706433:8088',
      'http://127.0.0.1', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://127.0.0.1:8088/path',
      'http://user@127.0.0.1:8088', 'http://127.0.0.1:8088?', 'http://127.0.0.1:8088#', 'http://127.0.0.1:8088/../',
      ' http://127.0.0.1:8088', 'http://127.0.0.1:8088\\'].map(baseUrl => ({ ...apus, judge: { ...apus.judge, baseUrl } })),
    ...['', ' ', 'x'.repeat(257), 'alias\n', 1].map(model => ({ ...apus, judge: { ...apus.judge, model } })),
    ...[0, -1, 1.5, '10', null, 2147483648, Number.MAX_SAFE_INTEGER + 1].flatMap(n => [
      { ...typesafe, decision: { deadlineMs: n } }, { ...typesafe, observation: { ageMs: n } }]),
    ...[0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1].flatMap(n => ['running', 'waiting', 'bytes'].map(key => ({ ...typesafe, observation: { [key]: n } }))),
    { ...typesafe, decision: { extra: 1 } }, { ...typesafe, observation: { extra: 1 } },
    { ...typesafe, decision: [] }, { ...typesafe, observation: null }];
  for (const value of bad) { put(file, value); assert.equal(readOwnerSettings(home).state, 'invalid'); }
  for (const baseUrl of ['http://127.0.0.1:80/', 'http://[::1]:65535']) {
    put(file, { ...apus, judge: { ...apus.judge, baseUrl } }); assert.equal(readOwnerSettings(home).state, 'valid');
  }
}));
test('byte boundary, malformed JSON and UTF-8', () => fixture((home, file) => {
  const json = JSON.stringify(typesafe);
  for (const bytes of [32768, 32769]) {
    writeFileSync(file, json + ' '.repeat(bytes - Buffer.byteLength(json)), { mode: 0o600 });
    assert.equal(readOwnerSettings(home).state, bytes === 32768 ? 'valid' : 'invalid');
  }
  for (const value of ['{secret', Buffer.from([0xff])]) {
    writeFileSync(file, value); assert.equal(readOwnerSettings(home).state, 'invalid');
  }
}));
test('unsafe files, directories, ancestors and hard links do not get repaired', () => fixture((home, file) => {
  put(file, typesafe); const bytes = readFileSync(file);
  chmodSync(file, 0o644); assert.equal(readOwnerSettings(home).state, 'invalid'); assert.deepEqual(readFileSync(file), bytes);
  chmodSync(file, 0o000); assert.equal(readOwnerSettings(home).state, 'invalid'); chmodSync(file, 0o600);
  chmodSync(join(home, '.tenet'), 0o000); assert.equal(readOwnerSettings(home).state, 'invalid'); chmodSync(join(home, '.tenet'), 0o700);
  chmodSync(join(home, '.tenet'), 0o755); assert.equal(readOwnerSettings(home).state, 'invalid'); chmodSync(join(home, '.tenet'), 0o700);
  linkSync(file, join(home, 'hard')); assert.equal(readOwnerSettings(home).state, 'invalid'); rmSync(join(home, 'hard'));
  rmSync(file); mkdirSync(file); assert.equal(readOwnerSettings(home).state, 'invalid'); rmSync(file, { recursive: true });
  symlinkSync(join(home, 'missing-target'), file); assert.equal(readOwnerSettings(home).state, 'invalid'); rmSync(file);
  put(join(home, 'target'), typesafe); symlinkSync(join(home, 'target'), file); assert.equal(readOwnerSettings(home).state, 'invalid');
  rmSync(file); rmSync(join(home, '.tenet'), { recursive: true }); symlinkSync(home, join(home, '.tenet')); assert.equal(readOwnerSettings(home).state, 'invalid');
  rmSync(join(home, '.tenet')); symlinkSync(home, join(home, 'ancestor')); assert.equal(readOwnerSettings(join(home, 'ancestor')).state, 'invalid');
}));
test('internal IO seam rejects wrong owners, unreadability, races and growing reads; descriptors are bounded and closed', () => fixture((home, file) => {
  put(file, typesafe);
  const io = { closeSync, fstatSync, lstatSync, openSync, readSync };
  for (const target of [file, join(home, '.tenet')]) {
    const wrongOwner = { ...io, lstatSync: ((path: string) => changed(lstatSync(path), path === target ? { uid: (process.getuid?.() ?? 0) + 1 } : {})) as typeof lstatSync };
    assert.equal(readOwnerSettings(home, wrongOwner).state, 'invalid');
  }
  for (const method of ['openSync', 'readSync'] as const) {
    const failure = { ...io, [method]: () => { throw Object.assign(new Error('private-error-canary'), { code: 'EACCES' }); } };
    const result = readOwnerSettings(home, failure);
    assert.deepEqual(result, { state: 'invalid', reason: 'unreadable' });
    assert.ok(!JSON.stringify(result).includes('private-error-canary'));
  }
  let closed = 0, flags = 0, reads = 0;
  const recorded = { ...io, openSync: ((path: string, mode: number) => { flags = mode; return openSync(path, mode); }) as typeof openSync,
    readSync: ((...args: Parameters<typeof readSync>) => { reads++; return readSync(...args); }) as typeof readSync,
    closeSync: (fd: number) => { closed++; closeSync(fd); } };
  assert.equal(readOwnerSettings(home, recorded).state, 'valid');
  assert.ok(flags & constants.O_NOFOLLOW); assert.ok(flags & constants.O_NONBLOCK); assert.equal(flags & 3, constants.O_RDONLY);
  assert.equal(closed, 1); assert.equal(reads, 2);
  const race = { ...recorded, fstatSync: ((fd: number) => changed(fstatSync(fd), { ino: fstatSync(fd).ino + 1 })) as typeof fstatSync };
  assert.deepEqual(readOwnerSettings(home, race), { state: 'invalid', reason: 'unsafe' }); assert.equal(closed, 2);
  const growth = { ...io, readSync: ((fd: number, buffer: Buffer, offset: number, length: number) => {
    buffer.fill(32, offset, offset + length); return length;
  }) as typeof readSync };
  assert.deepEqual(readOwnerSettings(home, growth), { state: 'invalid', reason: 'oversized' });
}));
test('effective defaults, overrides, invalid common configuration', () => fixture((home, file) => {
  const defaults = prepareConfiguration({ env: {}, home });
  assert.equal(defaults.status.deadlineMs, 2500);
  assert.deepEqual(defaults.status.observation, { running: 2, waiting: 32, bytes: 1048576, ageMs: 5000 });
  put(file, apus);
  const merged = prepareConfiguration({ env: { TENET_JUDGE_DEADLINE_MS: '60000' }, home, observationLimits: { running: 2 } });
  assert.equal(merged.status.deadlineMs, 60000); assert.equal(merged.status.observation?.running, 2);
  for (const env of [{ TENET_JUDGE_DEADLINE_MS: 'bad' }, { TENET_SENSITIVE_FIELDS: 'bad' }])
    assert.equal(prepareConfiguration({ env, home }).status.availability, 'unavailable');
  assert.equal(prepareConfiguration({ env: {}, home, observationLimits: { ageMs: 2147483648 } }).status.availability, 'unavailable');
  put(file, { ...apus, decision: { deadlineMs: 0 } });
  assert.equal(prepareConfiguration({ env: { TENET_JUDGE_DEADLINE_MS: '60000' }, home }).status.availability, 'unavailable');
  put(file, { ...typesafe, decision: { deadlineMs: 2147483647 }, observation: { ageMs: 2147483647, running: Number.MAX_SAFE_INTEGER } });
  assert.equal(prepareConfiguration({ env: {}, home }).status.availability, 'ready');
}));

test('SDK freezes valid and invalid owner snapshots across work and new sessions; project settings have no effect', async () => {
  const home = realpathSync(mkdtempSync('/tmp/tenet-settings-sdk-')); const prior = process.env.HOME; process.env.HOME = home;
  mkdirSync(join(home, '.tenet'), { mode: 0o700 }); const file = join(home, '.tenet/config.json');
  const cwd = join(home, 'project'); mkdirSync(cwd); writeFileSync(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
  mkdirSync(join(cwd, '.tenet')); put(join(cwd, '.tenet/config.json'), apus);
  const guards: ReturnType<typeof createGuard>[] = [];
  const make = (extra = {}) => { const g = createGuard({ host: 'offline', env: { TENET_RECORDING: 'off', TENET_MODE: 'enforce' },
    controlPath: join(home, '.tenet/control.json'), ...extra }); guards.push(g); return g; };
  try {
    const absent = make(); assert.equal(absent.status().judge.provider, 'typesafe');
    put(file, apus); const unavailable = make(); const selected = unavailable.openSession({ sessionId: 'u', contextId: 'main' }, cwd);
    assert.equal((await selected.ready).state, 'ready');
    assert.equal(unavailable.status().judge.provider, 'apus-llamacpp'); assert.equal(unavailable.status().judge.requestedModel, apus.judge.model);
    let calls = 0; let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const injected = make({ judge: async (r: Parameters<import('../src/decision/contracts.js').Judge>[0]) => { calls++; await gate; return answer(r.policy); },
      createJudge: () => { throw new Error('must not construct'); } });
    const s = injected.openSession({ sessionId: 's', contextId: 'main' }, cwd); await s.ready;
    const call = { callId: 'c', toolName: 'fixture-data-only', input: {} };
    const pending = s.beforeTool({ ...call, current: () => ({ sessionId: 's', contextId: 'main', ...call }) });
    while (!calls) await new Promise(resolve => setTimeout(resolve, 1));
    put(file, { ...typesafe, decision: { deadlineMs: 12 } }); release();
    assert.equal((await pending).assessment.status, 'completed');
    assert.equal(injected.status().configuration.deadlineMs, 120000);
    assert.equal((await injected.openSession({ sessionId: 's2', contextId: 'main' }, cwd).ready).configuration.deadlineMs, 120000);
    assert.equal(make().status().configuration.deadlineMs, 12);
    writeFileSync(file, 'invalid-private-canary'); const invalid = make({ judge: async () => { throw new Error('must not run'); } });
    put(file, typesafe);
    const bad = invalid.openSession({ sessionId: 'bad', contextId: 'main' }, cwd); assert.equal((await bad.ready).reason, 'configuration');
    const result = await bad.beforeTool({ ...call, current: () => ({ sessionId: 'bad', contextId: 'main', ...call }) });
    assert.equal(result.permission, 'blocked'); assert.equal(result.assessment.status, 'unavailable');
    assert.ok(!JSON.stringify(invalid.status()).includes('invalid-private-canary'));
  } finally { for (const g of guards) await g.close(); if (prior === undefined) delete process.env.HOME; else process.env.HOME = prior; rmSync(home, { recursive: true, force: true }); }
});

async function isolatedOwner(work: (home: string, file: string) => Promise<void>) {
  const home = realpathSync(mkdtempSync('/tmp/tenet-settings-owner-')); const prior = process.env.HOME;
  process.env.HOME = home; mkdirSync(join(home, '.tenet'), { mode: 0o700 });
  try { await work(home, join(home, '.tenet/config.json')); }
  finally { if (prior === undefined) delete process.env.HOME; else process.env.HOME = prior; rmSync(home, { recursive: true, force: true }); }
}
test('JSON queue releases first, freezes retained input, drops capacity and age, and cancels pending work', async () => isolatedOwner(async (home, file) => {
  put(file, { ...typesafe, decision: { deadlineMs: 1000 }, observation: { running: 1, waiting: 1, bytes: 1048576, ageMs: 40 } });
  const cwd = join(home, 'project'); mkdirSync(cwd); writeFileSync(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
  const requests: import('../src/decision/contracts.js').JudgeRequest[] = [], events: import('../src/sdk/types.js').OwnerEvent[] = [];
  const guard = createGuard({ host: 'offline', env: { TENET_RECORDING: 'off' }, controlPath: join(home, '.tenet/control.json'),
    judge: request => { requests.push(request); return new Promise(() => {}); }, onOwnerEvent: event => events.push(event) });
  const s = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd); await s.ready;
  const invoke = (callId: string, input = { text: 'original' }) => s.beforeTool({ callId, toolName: 'data-only', input,
    current: () => ({ sessionId: 's', contextId: 'main', callId, toolName: 'data-only', input }) });
  try {
    const input = { text: 'before' }; const one = await invoke('one', input);
    assert.equal(one.permission, 'released'); assert.equal(one.assessment.status, 'pending');
    assert.equal(events.find(e => e.type === 'permission')?.result.permission, 'released');
    input.text = 'after'; s.afterTool({ callId: 'one', toolName: 'data-only', content: 'later-result' });
    put(file, { ...typesafe, decision: { deadlineMs: 1 }, observation: { running: 2, waiting: 2, bytes: 200, ageMs: 1 } });
    await invoke('two'); const third = await invoke('three'); assert.equal(third.permission, 'released'); assert.equal(third.assessment.status, 'dropped');
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.equal(requests.length, 1); assert.equal((requests[0]!.action.arguments as { text: string }).text, 'before'); assert.ok(Object.isFrozen(requests[0]!.action));
    assert.ok(events.some(e => e.type === 'assessment' && e.callId === 'two' && e.assessment.reason === 'queue-expired'));
    assert.equal(guard.status().configuration.deadlineMs, 1000); assert.equal(guard.status().observations.limits.running, 1);
    s.invalidate('fixture-cancel'); assert.equal(guard.status().observations.cancelled, 1); assert.equal(guard.status().observations.retainedBytes, 0);
  } finally { await guard.close(); }
}));
for (const mode of ['observe', 'enforce'] as const) {
  test(`invalid settings have conservative ${mode} failure with off/dormant bypass`, async () => isolatedOwner(async (home, file) => {
    const cwd = join(home, 'project'); mkdirSync(cwd); writeFileSync(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
    const priorFetch = globalThis.fetch; let attempts = 0;
    globalThis.fetch = (() => { attempts++; throw new Error('network-trap'); }) as typeof fetch;
    try {
      for (const value of [{ ...typesafe, credentials: 'private-canary' }]) {
        put(file, value); const records: unknown[] = [];
        const guard = createGuard({ host: 'offline', env: { TENET_MODE: mode, TENET_RECORDING: 'off', TYPESAFE_API_KEY: 'must-not-forward' },
          controlPath: join(home, '.tenet/control.json'), bindRecording: () => (stage, data) => { records.push({ stage, data }); } });
        try {
          const s = guard.openSession({ sessionId: 's', contextId: 'main' }, cwd); assert.equal((await s.ready).state, 'unavailable');
          const call = { callId: 'c', toolName: 'fixture-only', input: {} };
          const before = () => s.beforeTool({ ...call, current: () => ({ sessionId: 's', contextId: 'main', ...call }) });
          const result = await before(); assert.equal(result.permission, mode === 'enforce' ? 'blocked' : 'released');
          assert.equal(result.assessment.status, 'unavailable'); assert.equal(result.assessment.wouldDecision, undefined);
          assert.ok(!JSON.stringify(records).includes('private-canary')); assert.ok(!JSON.stringify(records).includes('must-not-forward'));
          await guard.setActivation('off'); assert.equal((await before()).bypassReason, 'off');
          const dormantDir = join(home, `dormant-${records.length}`); mkdirSync(dormantDir, { recursive: true });
          const dormant = guard.openSession({ sessionId: 'dormant', contextId: 'main' }, dormantDir); assert.equal((await dormant.ready).state, 'dormant');
          assert.equal((await dormant.beforeTool({ ...call, current: () => ({ sessionId: 'dormant', contextId: 'main', ...call }) })).bypassReason, 'dormant');
        } finally { await guard.close(); rmSync(join(home, '.tenet/control.json'), { force: true }); }
      }
      assert.equal(attempts, 0);
    } finally { globalThis.fetch = priorFetch; }
  }));
}
test('SDK factory overrides APUS without credentials but cannot excuse invalid settings; SDK env cannot redirect the source', async () => isolatedOwner(async (home, file) => {
  put(file, apus); const cwd = join(home, 'project'); mkdirSync(cwd); writeFileSync(join(cwd, 'TENET.md'), 'Rule; Keep work local.');
  let constructions = 0;
  const create = () => createGuard({ host: 'offline', env: { HOME: cwd, TENET_CONFIG_PATH: join(cwd, 'redirect.json'), TENET_MODE: 'enforce', TENET_RECORDING: 'off' },
    controlPath: join(home, '.tenet/control.json'), createJudge: () => { constructions++; return async request => answer(request.policy); } });
  const g = create();
  try {
    assert.equal(g.status().judge.provider, 'injected'); assert.equal(constructions, 0); assert.equal(g.status().configuration.deadlineMs, 120000);
    const s = g.openSession({ sessionId: 's', contextId: 'main' }, cwd); assert.equal((await s.ready).state, 'ready');
    const call = { callId: 'c', toolName: 'fixture-only', input: {} };
    assert.equal((await s.beforeTool({ ...call, current: () => ({ sessionId: 's', contextId: 'main', ...call }) })).assessment.status, 'completed');
    assert.equal(constructions, 1);
  } finally { await g.close(); }
  put(file, { ...apus, observation: { running: 0 } }); const bad = create();
  try { assert.equal(bad.status().judge.reason, 'configuration'); assert.equal(bad.status().configuration.observation, null); assert.equal(constructions, 1); }
  finally { await bad.close(); }
}));
test('maintained guide JSON examples match the closed reader', () => fixture((home, file) => {
  const guide = readFileSync(join(import.meta.dirname, '../docs/judge.md'), 'utf8');
  const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]!));
  assert.deepEqual(examples, [typesafe, apus]);
  for (const example of examples) { put(file, example); assert.equal(readOwnerSettings(home).state, 'valid'); }
}));
test('fake Pi reports selected APUS and effective settings only to owner diagnostics', async () => isolatedOwner(async (home, file) => {
  put(file, apus); const priorFetch = globalThis.fetch; const fake = scriptedNative(); globalThis.fetch = fake.fetch;
  const h = await guardHarness({ judge: null });
  try {
    await h.start(); assert.match(h.notifications.join('\n'), /APUS llama.cpp experimental/);
    assert.equal(h.records.find(r => r.stage === 'status').configuration.deadlineMs, 120000);
    await h.commands.get('tenet').handler('status', h.ctx);
    assert.match(h.notifications.join('\n'), /settings ~\/\.tenet\/config.json/); assert.match(h.notifications.join('\n'), /120000ms/);
    assert.equal(await h.call(), undefined); // Observe releases without a veto.
    assert.equal((await h.assessed()).status, 'completed'); assert.equal(fake.calls.filter(c => c.path === '/completion').length, 4);
    assert.equal(h.prompts.length, 0); assert.ok(!h.records.some(r => r.stage === 'message' || r.stage === 'request'));
  } finally { await h.close(); globalThis.fetch = priorFetch; }
}));
