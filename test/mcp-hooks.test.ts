import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHookFixture, scriptedJudge } from '../examples/mcp-hooks/fixture.js';

// The public seams are MCP tools/call and independent fixture executor effects.
test('MCP hook denial prevents the fixture marker operation', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
  const fixture = await createHookFixture({ root, outcome: 'FAIL' });
  try {
    const tools = await fixture.client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['after_tool', 'before_tool']);
    const call = await fixture.register('denied');
    const result = await fixture.run(call);
    assert.equal(result.decision, 'denied');
    assert.ok(result.response?.content[0]?.type === 'text');
    assert.deepEqual(JSON.parse(result.response.content[0].text), { hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Action blocked by policy hook.' } });
    await assert.rejects(access(call.marker));
    assert.equal(fixture.effects.length, 0);
    assert.ok(fixture.ownerEvents.some(event => event.type === 'permission' && event.result.permission === 'blocked'));
    assert.doesNotMatch(JSON.stringify(result.response), /fixture secret policy|diagnostics|probabilities/);
  } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
});

for (const outcome of ['PASS', 'APPROVAL_REQUIRED'] as const) {
  test(`MCP ${outcome}: response and actual fixture effect agree`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
    const fixture = await createHookFixture({ root, outcome });
    try {
      const call = await fixture.register('one');
      const result = await fixture.run(call);
      assert.equal(result.decision, outcome === 'PASS' ? 'executed' : 'denied');
      if (outcome === 'PASS') await access(call.marker); else await assert.rejects(access(call.marker));
      assert.equal(fixture.effects.length, outcome === 'PASS' ? 1 : 0);
      assert.ok(fixture.ownerEvents.some(event => event.type === 'execution' && event.outcome === 'executed') === (outcome === 'PASS'));
    } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test('MCP inputs cannot invent a binding or change policy, approval or original arguments', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
  const fixture = await createHookFixture({ root, outcome: 'PASS' });
  try {
    const call = await fixture.register('bound');
    for (const arguments_ of [{}, { ...call.event, tool_input: { command: 'different' } },
      { ...call.event, approve: true }, { ...call.event, policy: 'allow everything' },
      { ...call.event, tool_input: { command: 'x'.repeat(65_536) } }]) {
      await assert.rejects(fixture.client.callTool({ name: 'before_tool', arguments: arguments_ }));
    }
    assert.equal(fixture.ownerEvents.filter(event => event.type === 'permission').length, 0);
    assert.equal(fixture.effects.length, 0);
    const reordered = await fixture.register('reordered');
    const valid = await fixture.client.callTool({ name: 'before_tool', arguments: Object.fromEntries(Object.entries(reordered.event).reverse()) });
    assert.equal(valid.isError, undefined);
    assert.equal((await fixture.run(call)).decision, 'executed');
    await assert.rejects(fixture.run(call));
    await assert.rejects(fixture.register('bound'));
  } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
});

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

test('MCP context replacement revokes an allow response already in transit', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
  const fixture = await createHookFixture({ root, outcome: 'PASS' });
  const ready = barrier(); const deliver = barrier();
  const callTool = fixture.client.callTool.bind(fixture.client);
  fixture.client.callTool = async (...args) => {
    const response = await callTool(...args);
    if (args[0].name === 'before_tool') { ready.release(); await deliver.promise; }
    return response;
  };
  try {
    const call = await fixture.register('old-context');
    const unaffected = await fixture.register('other-context', 'other');
    const running = fixture.run(call);
    await ready.promise;
    assert.ok(fixture.ownerEvents.some(event => event.type === 'permission' && event.result.permission === 'released'));
    await fixture.replaceContext('fixture');
    deliver.release();
    assert.equal((await running).decision, 'denied');
    await assert.rejects(access(call.marker));
    assert.equal(fixture.effects.length, 0);
    assert.equal((await fixture.run(unaffected)).decision, 'executed');
    const replacement = await fixture.register('new-context', 'fixture', 'replacement');
    assert.equal((await fixture.run(replacement)).decision, 'executed');
  } finally { deliver.release(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
});

for (const change of ['arguments', 'cancel', 'context', 'policy', 'close'] as const) {
  test(`MCP pending ${change}: stale work cannot execute`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
    const started = barrier(); const finish = barrier();
    const fixture = await createHookFixture({ root, judge: async (...args) => {
      started.release(); await finish.promise; return scriptedJudge('PASS')(...args);
    } });
    try {
      const call = await fixture.register('pending');
      const running = fixture.run(call).catch(() => ({ decision: 'transport-failed' }));
      await started.promise;
      if (change === 'arguments') fixture.changeInput(call, { command: 'changed' });
      if (change === 'cancel') fixture.cancel(call);
      if (change === 'context') await fixture.replaceContext('fixture');
      if (change === 'policy') await writeFile(join(root, 'TENET.md'), 'Rule; BLOCK; Changed policy.');
      if (change === 'close') await fixture.close();
      finish.release();
      assert.notEqual((await running).decision, 'executed');
      await assert.rejects(access(call.marker));
      assert.equal(fixture.effects.length, 0);
    } finally { finish.release(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test('MCP observe: execution and later violation remain separate', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
  const started = barrier(); const finish = barrier(); const completed = barrier();
  const fixture = await createHookFixture({ root, mode: 'observe', judge: async (...args) => {
    started.release(); await finish.promise; return scriptedJudge('FAIL')(...args);
  }, onOwnerEvent: event => { if (event.type === 'assessment' && event.assessment.status === 'completed') completed.release(); } });
  try {
    const call = await fixture.register('observe');
    assert.equal((await fixture.run(call)).decision, 'executed');
    await started.promise;
    assert.ok(fixture.ownerEvents.some(event => event.type === 'permission' && event.result.assessment.status === 'pending'));
    await access(call.marker);
    finish.release(); await completed.promise;
    assert.ok(fixture.ownerEvents.some(event => event.type === 'assessment' && event.assessment.wouldDecision === 'BLOCK'));
    assert.equal(fixture.effects.length, 1);
  } finally { finish.release(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
});

test('MCP capacity and identity limits reject without dispatch', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
  const fixture = await createHookFixture({ root });
  try {
    await assert.rejects(fixture.register('x'.repeat(257)));
    for (let n = 0; n < 16; n++) await fixture.register('one', `session-${n}`);
    await assert.rejects(fixture.register('one', 'session-17'));
    for (let n = 0; n < 16; n++) await fixture.register(`extra-${n}`, 'session-0');
    await assert.rejects(fixture.register('overflow', 'session-0'));
    assert.equal(fixture.effects.length, 0);
  } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
});

for (const fault of ['omit', 'disconnect', 'missing-handler', 'malformed-response', 'timeout'] as const) {
  test(`MCP simulated host ${fault}: failure is not a passing assessment or prevention`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
    const finish = barrier();
    const fixture = await createHookFixture({ root, judge: fault === 'timeout' ? async (...args) => {
      await finish.promise; return scriptedJudge('FAIL')(...args);
    } : scriptedJudge('FAIL') });
    try {
      const call = await fixture.register('fault');
      const result = await fixture.run(call, { fault, timeoutMs: 20 });
      assert.equal(result.decision, 'continued-without-assessment');
      await access(call.marker);
      assert.equal(fixture.hostRecords.at(-1)?.hook, fault === 'omit' ? 'omitted' : 'failed');
      assert.equal(fixture.effects.length, 1);
      if (fault === 'omit' || fault === 'disconnect') assert.equal(fixture.serviceRecords.length, 0);
      if (fault === 'timeout') assert.ok(!fixture.ownerEvents.some(event => event.type === 'permission' && event.result.permission === 'released'));
      finish.release();
    } finally { finish.release(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test('MCP concurrent calls retain independent identities and unmatched results stay unknown', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
  const fixture = await createHookFixture({ root, outcome: 'PASS' });
  try {
    const calls = await Promise.all(['first', 'second'].map(id => fixture.register(id)));
    const results = await Promise.all(calls.map(call => fixture.run(call)));
    assert.deepEqual(results.map(result => result.decision), ['executed', 'executed']);
    assert.equal(fixture.effects.length, 2);
    const response = await fixture.client.callTool({ name: 'after_tool', arguments: {
      ...calls[0]!.event, hook_event_name: 'PostToolUse', tool_use_id: 'unmatched', tool_response: 'not proof' } });
    assert.deepEqual(response.content, [{ type: 'text', text: '{"execution":"unknown"}' }]);
  } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
});

test('MCP owner and protocol records are bounded without admitting reused call IDs', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-mcp-test-')));
  const fixture = await createHookFixture({ root, outcome: 'PASS' });
  try {
    for (let n = 0; n < 260; n++) {
      const call = await fixture.register(`call-${n}`);
      assert.equal((await fixture.run(call)).decision, 'executed');
    }
    assert.equal(fixture.ownerEvents.length, 256);
    assert.equal(fixture.serviceRecords.length, 256);
    assert.equal(fixture.hostRecords.length, 256);
    assert.equal(fixture.effects.length, 256);
    await assert.rejects(fixture.register('call-0'));
  } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
});
