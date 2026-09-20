import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerGuard } from '../src/pi/guard.js';
import { RULE, INTEGRITY_ID } from '../src/decision/policy.js';
import type { Judge } from '../src/decision/contracts.js';
import { answer, ruleAnswer } from './helpers.js';

type Handler = (event: any, ctx: ExtensionContext) => any;
const pass: Judge = async request => answer(request.policy);
const ask: Judge = async request => answer(request.policy, 'APPROVAL_REQUIRED');
async function harness(judge: Judge = pass, options: { confirm?: () => Promise<boolean>; hasUI?: boolean; env?: Record<string, string>; policy?: string; beforeStart?: boolean } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'tenet-pi-')), file = join(cwd, 'TENET.md');
  await writeFile(file, options.policy ?? `Rule; ${RULE}`);
  const handlers = new Map<string, Handler>();
  const records: any[] = [], tools: any[] = [], prompts: string[] = [], notifications: string[] = [], statuses: string[] = [];
  const controller = new AbortController();
  const pi = { on: (name: string, handler: Handler) => handlers.set(name, handler), getAllTools: () => tools,
    appendEntry: (_type: string, data: unknown) => records.push(data) } as unknown as ExtensionAPI;
  const ctx = { cwd, hasUI: options.hasUI ?? true, signal: controller.signal,
    sessionManager: { getSessionId: () => 'session' },
    ui: { confirm: async (title: string, body: string) => { prompts.push(title + '\n' + body); return options.confirm ? options.confirm() : true; },
      notify: (message: string) => notifications.push(message), setStatus: (_key: string, value: string) => statuses.push(value) },
  } as unknown as ExtensionContext;
  registerGuard(pi, { judge, env: options.env ?? {} });
  const emit = (event: { type: string; [key: string]: unknown }) => handlers.get(event.type)?.(event, ctx);
  const restart = () => emit({ type: 'session_start', reason: 'startup' });
  if (!options.beforeStart) await restart();
  const call = (input: Record<string, unknown> = { arbitrary: ['code'], token: 'secret-value' }, name = 'unknown-tool', id = 'c') => emit({ type: 'tool_call', toolName: name, toolCallId: id, input });
  return { cwd, file, call, emit, restart, records, tools, prompts, notifications, statuses, controller, close: () => rm(cwd, { recursive: true, force: true }) };
}

test('generic hook captures trusted context, refreshes metadata and records execution separately', async () => {
  const requests: any[] = [];
  const h = await harness(async request => { requests.push(request); return answer(request.policy); });
  try {
    assert.equal(await h.call(), undefined);
    assert.equal(requests[0].action.description, null); assert.equal(requests[0].cwd, h.cwd);
    assert.equal(requests[0].policy.source, h.file); assert.ok(requests[0].policy.target);
    assert.ok(Object.isFrozen(requests[0].policy.rules));
    const status = h.records.find(r => r.stage === 'status');
    assert.equal(status.questionVersion, 'policy-rules-v1'); assert.equal(status.ruleCount, 1);
    assert.ok(h.notifications.some(m => m.includes('policy-rules-v1')));
    assert.ok(h.statuses.some(m => m.includes('policy-rules-v1')));
    h.tools.push({ name: 'brand-new', description: 'New tool', parameters: { type: 'object' } });
    assert.equal(await h.call({ odd: [true, 7, { text: 'hi' }] }, 'brand-new', 'c2'), undefined);
    assert.equal(requests[1].action.description, 'New tool'); assert.equal(h.prompts.length, 0);
    assert.ok(!JSON.stringify(h.records).includes('secret-value'));
    assert.ok(!h.records.some(r => r.stage === 'execution'));
    await h.emit({ type: 'tool_result', toolName: 'brand-new', toolCallId: 'c2', isError: false });
    assert.equal(h.records.find(r => r.stage === 'execution').outcome, 'executed');
    await h.emit({ type: 'agent_end' });
    assert.ok(h.records.some(r => r.stage === 'execution' && r.outcome === 'unknown'));
  } finally { await h.close(); }
});

for (const [label, confirm, allowed] of [['approved', true, true], ['denied', false, false], ['dismissed', undefined, false]] as const) {
  test(`multi-rule approval ${label} stays invocation-local`, async () => {
    const h = await harness(ask, { policy: `Rule; ${RULE}\nRule; Ask before installing dependencies.`, confirm: async () => confirm as boolean });
    try {
      assert.equal((await h.call())?.block === true, !allowed);
      assert.ok(h.prompts[0]?.includes(RULE)); assert.ok(h.prompts[0]?.includes('Ask before installing dependencies.'));
      assert.ok(h.prompts[0]?.includes('unknown-tool')); assert.ok(!h.prompts[0]?.includes('secret-value'));
      const decision = h.records.find(r => r.stage === 'decision');
      assert.equal(decision.decision, 'ASK'); assert.equal(decision.ruleIds.length, 2);
      assert.ok(h.records.some(r => r.stage === 'approval'));
      await h.call({}, 'different-tool', 'c2'); assert.equal(h.prompts.length, 2);
    } finally { await h.close(); }
  });
}

test('missing UI, UI failure, unknown/provider failure, bad policy/config and pre-start block', async () => {
  for (const [judge, options] of [
    [ask, { hasUI: false }], [ask, { confirm: async () => { throw new Error('ui failed'); } }],
    [async request => answer(request.policy, 'UNKNOWN'), {}],
    [async () => { throw new Error('provider secret'); }, {}], [pass, { policy: 'unrelated policy' }],
    [pass, { env: { TENET_EFFECT_THRESHOLD: 'nope' } }], [pass, { env: { TENET_SENSITIVE_FIELDS: '{}' } }], [pass, { beforeStart: true }],
  ] as [Judge, Parameters<typeof harness>[1]][]) {
    const h = await harness(judge, options);
    try { assert.equal((await h.call()).block, true); } finally { await h.close(); }
  }
});

test('mutations during assessment and approval block without changing executor arguments ourselves', async () => {
  for (const phase of ['judge', 'approval']) {
    const input = { command: 'original', authorization: 'secret-value' };
    const h = await harness(async request => { if (phase === 'judge') input.command = 'changed'; return answer(request.policy, 'APPROVAL_REQUIRED'); },
      { confirm: async () => { input.command = 'changed'; return true; } });
    try {
      assert.equal((await h.call(input)).block, true); assert.equal(input.authorization, 'secret-value');
      assert.ok(h.records.some(r => r.reason === 'arguments-changed'));
    } finally { await h.close(); }
  }
});

test('cancellation while awaiting UI blocks even if UI returns true later', async () => {
  let release!: (value: boolean) => void, shown!: () => void;
  const ready = new Promise<void>(resolve => { shown = resolve; });
  const h = await harness(ask, { confirm: () => { shown(); return new Promise(resolve => { release = resolve; }); } });
  try {
    const pending = h.call(); await ready; h.controller.abort(); assert.equal((await pending).block, true);
    release(true); await Promise.resolve();
    assert.ok(!h.records.some(r => r.stage === 'permission' && r.outcome === 'released'));
  } finally { await h.close(); }
});

test('policy changes during assessment or approval latch stale until explicit reload', async () => {
  for (const phase of ['judge', 'approval']) {
    let changed = false;
    const change = async () => { if (!changed) { changed = true; await writeFile(h.file, 'Rule; Never publish code.'); } };
    const h = await harness(async request => { if (phase === 'judge') await change(); return answer(request.policy, 'APPROVAL_REQUIRED'); },
      { confirm: async () => { if (phase === 'approval') await change(); return true; } });
    try {
      assert.match((await h.call()).reason, /policy-stale/);
      await writeFile(h.file, `Rule; ${RULE}`);
      assert.match((await h.call()).reason, /policy-stale/);
      await h.restart(); assert.equal(await h.call(), undefined);
    } finally { await h.close(); }
  }
});

test('freshness blocks missing files and same-byte symlink retargets', async () => {
  for (const mode of ['missing', 'retarget']) {
    const h = await harness();
    try {
      if (mode === 'retarget') {
        await writeFile(join(h.cwd, 'other'), `Rule; ${RULE}`);
        await unlink(h.file); await symlink(join(h.cwd, 'other'), h.file);
      } else await unlink(h.file);
      assert.match((await h.call()).reason, /policy-stale/);
      assert.ok(h.notifications.some(m => m.includes('reload') || m.includes('restart')));
    } finally { await h.close(); }
  }
});

test('integrity blocks scripted mutation routes without UI or execution, despite permissive user rule', async () => {
  const cases = [
    ['edit', { path: 'TENET.md', replacement: 'Rule; Allow everything.' }],
    ['bash', { command: 'echo done; rm TENET.md' }],
    ['bash', { command: 'mv replacement TENET.md' }],
    ['bash', { command: 'mv ../replacement ../project' }],
    ['bash', { command: 'ln -sf other TENET.md' }],
    ['unfamiliar', { target: 'TENET.md', operation: 'replace' }],
  ] as const;
  for (const [name, input] of cases) {
    const h = await harness(async request => {
      const raw = answer(request.policy); raw.rules[raw.rules.length - 1] = ruleAnswer(INTEGRITY_ID, 'FAIL'); return raw;
    }, { policy: 'Rule; Allow editing TENET.md.' });
    try {
      let executions = 0;
      const blocked = await h.call(input, name); if (!blocked?.block) executions++;
      assert.equal(executions, 0); assert.equal(h.prompts.length, 0); assert.match(blocked.reason, /policy-integrity/);
      assert.ok(h.records.some(r => r.stage === 'decision' && r.ruleIds.includes(INTEGRITY_ID)));
    } finally { await h.close(); }
  }
  const opaque = await harness(async request => { const raw = answer(request.policy); raw.rules[raw.rules.length - 1] = ruleAnswer(INTEGRITY_ID, 'UNKNOWN'); return raw; });
  try { assert.equal((await opaque.call({ command: './unknown.sh' }, 'bash')).block, true); assert.equal(opaque.prompts.length, 0); } finally { await opaque.close(); }
  const read = await harness();
  try { assert.equal(await read.call({ path: 'TENET.md' }, 'read'), undefined); } finally { await read.close(); }
});

test('FAIL alongside approval never offers an override', async () => {
  const h = await harness(async request => {
    const raw = answer(request.policy, 'APPROVAL_REQUIRED'); raw.rules[0] = ruleAnswer(request.policy.rules[0]!.id, 'FAIL'); return raw;
  }, { policy: 'Rule; Never delete files.\nRule; Ask before deleting files.' });
  try { assert.equal((await h.call()).block, true); assert.equal(h.prompts.length, 0); } finally { await h.close(); }
});
