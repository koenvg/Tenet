import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { ActivationStore } from '../src/pi/activation.js';
import { readArchive } from '../src/recording/archive.js';
import { guardHarness } from './guard-harness.js';
import { answer } from './helpers.js';

const wait = async (ready: () => boolean) => {
  const limit = Date.now() + 1500;
  while (!ready()) {
    if (Date.now() > limit) throw new Error('Timed out waiting for guard state');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

const footer = (statuses: string[]) => statuses.filter(s => s.startsWith('TENET ') && !s.startsWith('TENET capture')).at(-1) ?? '';
test('commands toggle Pi-wide status without exposing evidence or recording disabled calls', async () => {
  const requests: unknown[] = [];
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async request => {
    requests.push(request); return answer(request.policy);
  } });
  try {
    await h.start();
    const command = h.commands.get('tenet');
    assert.ok(command);
    await command.handler('off', h.ctx);
    assert.match(footer(h.statuses), /TENET OFF.*base ENFORCE/);
    assert.equal(await h.call('off-one'), undefined);
    await h.emit('tool_result', { toolCallId: 'off-one', toolName: 'edit', content: ['secret'] });
    assert.equal(requests.length, 0);
    assert.equal(h.records.some((r: any) => r.callId === 'off-one'), false);
    await command.handler('status', h.ctx);
    assert.match(h.notifications.at(-1)!, /TENET OFF.*capture OFF/);
    await command.handler('enable', h.ctx);
    assert.match(h.notifications.at(-1)!, /Usage/);
    assert.equal(await h.call('still-off'), undefined);
    await command.handler('on', h.ctx);
    assert.match(footer(h.statuses), /TENET ON ENFORCE/);
    assert.equal(await h.call('on-one'), undefined);
    assert.equal(requests.length, 1);
    assert.ok(h.records.some((r: any) => r.callId === 'on-one'));
    await command.handler('', h.ctx);
    assert.ok(h.views.length);
  } finally { await h.close(); }
});

test('activation commands are idempotent, report write failures, and require owner UI', { timeout: 30000 }, async () => {
  const h = await guardHarness({ env: { TENET_MODE: 'observe' } });
  const headless = await guardHarness({ hasUI: false });
  try {
    await h.start(); await headless.start();
    const command = h.commands.get('tenet');
    await command.handler('off', h.ctx);
    await command.handler('off', h.ctx);
    assert.match(footer(h.statuses), /TENET OFF/);
    await command.handler('on', h.ctx);
    await command.handler('on', h.ctx);
    assert.match(footer(h.statuses), /TENET ON OBSERVE/);
    await headless.commands.get('tenet').handler('off', headless.ctx);
    assert.equal(new ActivationStore(join(headless.cwd, 'control.json')).read(), 'on');
    assert.equal(headless.notifications.length + headless.statuses.length, 0);
    const path = join(h.cwd, 'control.json');
    await chmod(path, 0o644);
    await command.handler('off', h.ctx);
    assert.match(h.notifications.at(-1)!, /control update failed/);
    assert.match(footer(h.statuses), /CONTROL UNAVAILABLE/);
    await chmod(path, 0o600);
    await command.handler('on', h.ctx);
    assert.match(footer(h.statuses), /TENET ON OBSERVE/);
  } finally { await headless.close(); await h.close(); }
});

test('status distinguishes active capture from configured capture and remains owner-only', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-status-')));
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: join(root, 'recordings') } });
  try {
    await h.start();
    assert.match(footer(h.statuses), /TENET ON OBSERVE.*capture ON/);
    await h.commands.get('tenet').handler('off', h.ctx);
    assert.match(footer(h.statuses), /TENET OFF.*capture OFF/);
    assert.match(h.statuses.filter((s: string) => s.startsWith('TENET capture')).at(-1)!, /capture OFF/);
    await h.commands.get('tenet').handler('status', h.ctx);
    assert.match(h.notifications.at(-1)!, /TENET OFF.*base OBSERVE.*capture OFF/);
    assert.ok(!h.notifications.at(-1)!.includes('secret-evidence'));
    await h.commands.get('tenet').handler('on', h.ctx);
    assert.match(footer(h.statuses), /TENET ON OBSERVE.*capture ON/);
  } finally { await h.close(); await rm(root, { recursive: true, force: true }); }
});

test('off never binds an archive or feeds trajectory and preserves prior recordings', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-off-')));
  const archivePath = join(root, 'recordings');
  const requests: any[] = [];
  const h = await guardHarness({ env: { TENET_RECORDING: 'on', TENET_RECORDING_DIR: archivePath }, judge: async request => {
    requests.push(request); return answer(request.policy);
  } });
  try {
    const control = new ActivationStore(join(h.cwd, 'control.json'));
    await control.write('off');
    await h.start();
    assert.equal(h.records.length, 0, 'no session status while off');
    assert.equal(await h.call('disabled', { token: 'never-record-this' }), undefined);
    await h.emit('tool_result', { toolCallId: 'disabled', toolName: 'edit', content: [{ text: 'never-record-this' }] });
    assert.equal(requests.length, 0);
    assert.equal(h.records.length, 0);
    assert.equal(h.branch.length, 0);
    assert.equal((await readArchive(archivePath)).records.length, 0);
    h.branch.push({ type: 'message', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [
      { type: 'toolCall', id: 'disabled', name: 'edit', arguments: { text: 'off-transcript-secret' } },
    ] } });
    h.branch.push({ type: 'message', timestamp: new Date().toISOString(), message: { role: 'toolResult',
      toolCallId: 'disabled', toolName: 'edit', content: [{ type: 'text', text: 'off-transcript-secret' }] } });
    assert.equal(await h.call('disabled-late'), undefined);
    await h.commands.get('tenet').handler('on', h.ctx);
    await h.emit('tool_result', { toolCallId: 'disabled-late', toolName: 'edit', content: [{ text: 'never-record-this' }] });
    assert.equal(await h.call('enabled'), undefined);
    assert.equal(requests.length, 1);
    assert.ok(!JSON.stringify(requests[0].trajectory).includes('off-transcript-secret'), 're-enable cannot replay off transcript');
    assert.ok(!requests[0].trajectory.observations.some((o: any) => o.callId === 'disabled-late'));
    assert.ok(!h.records.some((r: any) => r.callId === 'disabled-late'));
    await h.start();
    assert.equal(await h.call('enabled-after-restart'), undefined);
    assert.ok(!JSON.stringify(requests.at(-1).trajectory).includes('off-transcript-secret'), 'startup cannot replay off transcript');
    await h.commands.get('tenet').handler('off', h.ctx);
    const count = h.records.length;
    assert.equal(await h.call('disabled-again'), undefined);
    await h.emit('tool_result', { toolCallId: 'enabled', toolName: 'edit', content: [{ text: 'never-record-this' }] });
    assert.equal(h.records.length, count);
    assert.equal((await readArchive(archivePath)).records.some(r => r.callId === 'disabled-again'), false);
  } finally { await h.close(); await rm(root, { recursive: true, force: true }); }
});

test('two active projects and a restarted process use one choice; control corruption is unavailable', async () => {
  const first = await guardHarness({ env: { TENET_MODE: 'enforce' } });
  const second = await guardHarness({ controlPath: join(first.cwd, 'control.json'), env: { TENET_MODE: 'observe' } });
  try {
    await first.start(); await second.start();
    assert.equal(await first.call('already-released'), undefined);
    assert.ok(first.records.some((r: any) => r.stage === 'permission' && r.callId === 'already-released' && r.outcome === 'released'));
    await first.commands.get('tenet').handler('off', first.ctx);
    await wait(() => footer(second.statuses).includes('TENET OFF'));
    assert.equal(first.records.filter((r: any) => r.callId === 'already-released' && r.stage === 'permission').length, 1);
    assert.ok(!first.records.some((r: any) => r.callId === 'already-released' && r.outcome === 'blocked'));
    assert.equal(await second.call('disabled'), undefined);
    assert.ok(!second.records.some((r: any) => r.callId === 'disabled'));
    const restarted = await guardHarness({ controlPath: join(first.cwd, 'control.json'), env: { TENET_MODE: 'enforce' } });
    try {
      await restarted.start();
      assert.match(footer(restarted.statuses), /TENET OFF/);
      await second.commands.get('tenet').handler('on', second.ctx);
      await wait(() => footer(first.statuses).includes('TENET ON ENFORCE'));
      assert.equal(await first.call('restored'), undefined);
      assert.equal(await second.call('observed'), undefined);
      await new ActivationStore(join(first.cwd, 'control.json')).write('off');
      await wait(() => footer(restarted.statuses).includes('TENET OFF'));
      const store = new ActivationStore(join(first.cwd, 'control.json'));
      await store.write('on');
      await wait(() => footer(restarted.statuses).includes('TENET ON ENFORCE'));
    } finally { await restarted.close(); }
  } finally { await second.close(); await first.close(); }
});

test('off cancels pending enforce requests and late answers cannot authorize them', async () => {
  let resolve!: (value: any) => void;
  let started = false, judgeSignal: AbortSignal | undefined;
  const judgeAnswer = new Promise<any>(done => { resolve = done; });
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async (_request, signal) => {
    started = true; judgeSignal = signal; return judgeAnswer;
  } });
  try {
    await h.start();
    const pending = h.call('pending');
    await wait(() => started);
    await h.commands.get('tenet').handler('off', h.ctx);
    assert.equal(judgeSignal?.aborted, true, 'issuing process cancels before command completion');
    assert.equal((await pending).block, true);
    assert.ok(!h.records.some((r: any) => r.callId === 'pending' && r.stage === 'permission'));
    assert.equal(await h.call('off-call'), undefined);
    resolve(answer((h.records.find((r: any) => r.stage === 'status') as any).policy));
    await h.commands.get('tenet').handler('on', h.ctx);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(!h.records.some((r: any) => r.callId === 'pending' && r.stage === 'permission'));
  } finally { resolve(undefined); await h.close(); }
});

test('observe cancels an in-flight judge without a veto or late report', async () => {
  let resolve!: (value: any) => void;
  let started = false;
  const requests: any[] = [];
  const reply = new Promise<any>(done => { resolve = done; });
  const h = await guardHarness({ judge: async request => { requests.push(request); started = true; return reply; } });
  try {
    await h.start();
    const pending = h.call('observe-pending');
    await wait(() => started);
    await h.commands.get('tenet').handler('off', h.ctx);
    assert.equal(await pending, undefined);
    resolve(answer((h.records.find((r: any) => r.stage === 'status') as any).policy));
    await h.commands.get('tenet').handler('on', h.ctx);
    await h.emit('tool_result', { toolCallId: 'observe-pending', toolName: 'edit', content: [{ text: 'cancelled-observe-secret' }] });
    assert.equal(await h.call('after-cancelled-observe'), undefined);
    await wait(() => requests.length === 2);
    assert.ok(!requests.at(-1).trajectory.observations.some((o: any) => o.callId === 'observe-pending'), JSON.stringify(requests.at(-1).trajectory.observations.map((o: any) => [o.origin, o.callId])));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(h.records.some((r: any) => r.callId === 'observe-pending' && r.stage === 'permission' && r.outcome === 'released'));
    assert.ok(!h.records.some((r: any) => r.callId === 'observe-pending' && r.stage === 'decision'));
  } finally { resolve(undefined); await h.close(); }
});

test('a cancelled provider cannot append a late response after re-enable', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-late-')));
  const archivePath = join(root, 'recordings');
  let lateCapture: ((stage: 'response', data: Record<string, unknown>) => void) | undefined;
  let resolve!: (value: any) => void;
  const reply = new Promise<any>(done => { resolve = done; });
  const h = await guardHarness({ env: { TENET_MODE: 'enforce', TENET_RECORDING: 'on', TENET_RECORDING_DIR: archivePath },
    judge: async (_request, _signal, capture) => { lateCapture = capture; return reply; } });
  try {
    await h.start();
    const pending = h.call('late-recording');
    await wait(() => !!lateCapture);
    await h.commands.get('tenet').handler('off', h.ctx);
    assert.equal((await pending).block, true);
    await h.commands.get('tenet').handler('on', h.ctx);
    lateCapture?.('response', { bytes: 2, value: {}, truncated: false });
    resolve(answer((h.records.find((r: any) => r.stage === 'status') as any).policy));
    await h.close();
    const archived = await readArchive(archivePath);
    assert.ok(!archived.records.some(r => r.callId === 'late-recording' && r.stage === 'response'));
  } finally { resolve(undefined); await h.close(); await rm(root, { recursive: true, force: true }); }
});

test('off invalidates native approval; a late positive answer cannot grant the old call', async () => {
  let answerDialog!: (value: boolean) => void;
  let promptSignal: AbortSignal | undefined;
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async request => answer(request.policy, 'APPROVAL_REQUIRED') });
  try {
    await h.start();
    (h.ctx.ui as any).confirm = (_title: string, _body: string, options: { signal: AbortSignal }) => {
      promptSignal = options.signal;
      return new Promise<boolean>(resolve => { answerDialog = resolve; });
    };
    const pending = h.call('approval-pending');
    await wait(() => !!promptSignal);
    await h.commands.get('tenet').handler('off', h.ctx);
    assert.equal(promptSignal?.aborted, true);
    assert.equal((await pending).block, true);
    await h.commands.get('tenet').handler('on', h.ctx);
    answerDialog(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(!h.records.some((r: any) => r.callId === 'approval-pending' && r.outcome === 'released'));
    (h.ctx.ui as any).confirm = async () => false;
    assert.equal((await h.call('fresh-approval')).block, true);
    assert.ok(h.records.some((r: any) => r.callId === 'fresh-approval' && r.stage === 'approval'));
  } finally { answerDialog?.(false); await h.close(); }
});

test('turning off during session initialization does not strand readiness when re-enabled', async () => {
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' } });
  try {
    const starting = h.start();
    await new ActivationStore(join(h.cwd, 'control.json')).write('off');
    await starting;
    await h.commands.get('tenet').handler('on', h.ctx);
    assert.match(footer(h.statuses), /TENET ON ENFORCE.*ready:/);
    assert.equal(await h.call('after-start'), undefined);
  } finally { await h.close(); }
});

test('control unavailable blocks enforce, permits observe, and can be repaired', async () => {
  const requests: unknown[] = [];
  const judge = async (request: any) => { requests.push(request); return answer(request.policy); };
  const enforce = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge });
  const observe = await guardHarness({ env: { TENET_MODE: 'observe' }, controlPath: join(enforce.cwd, 'control.json'), judge });
  try {
    await enforce.start(); await observe.start();
    await writeFile(join(enforce.cwd, 'control.json'), 'broken json', { mode: 0o600 });
    assert.equal((await enforce.call('invalid')).block, true);
    assert.equal(await observe.call('invalid'), undefined);
    assert.match(footer(observe.statuses), /CONTROL UNAVAILABLE/);
    assert.ok(!enforce.records.some((r: any) => r.callId === 'invalid'));
    const path = join(enforce.cwd, 'control.json');
    await chmod(path, 0o000);
    assert.equal((await enforce.call('unreadable')).block, true);
    assert.equal(await observe.call('unreadable'), undefined);
    assert.equal(requests.length, 0);
    assert.ok(!enforce.records.some((r: any) => r.callId === 'unreadable'));
    await enforce.commands.get('tenet').handler('off', enforce.ctx);
    assert.match(footer(enforce.statuses), /TENET OFF/);
  } finally { await observe.close(); await enforce.close(); }
});
