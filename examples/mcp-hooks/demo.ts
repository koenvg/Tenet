import assert from 'node:assert/strict';
import { access, mkdtemp, realpath, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { createHookFixture, scriptedJudge, type Fault } from './fixture.js';

// Refuse direct execution with an owner home. Use scripts/check-mcp-hooks.sh.
const temporary = await realpath(tmpdir());
const home = await realpath(homedir());
const child = relative(temporary, home);
assert.ok(child && !child.startsWith('..') && !isAbsolute(child), 'Run the isolated mcp:check command, not this file directly.');

for (const outcome of ['FAIL', 'PASS', 'APPROVAL_REQUIRED'] as const) {
  const root = await realpath(await mkdtemp(join(temporary, 'demo-')));
  const fixture = await createHookFixture({ root, outcome });
  try {
    assert.equal((await fixture.client.listTools()).tools.length, 2);
    const call = await fixture.register('demo');
    const result = await fixture.run(call);
    assert.equal(result.decision, outcome === 'PASS' ? 'executed' : 'denied');
    if (outcome === 'PASS') await access(call.marker); else await assert.rejects(access(call.marker));
    console.log(`Local fixture ${outcome}: ${result.decision}; effects=${fixture.effects.length}`);
  } finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
}

for (const fault of ['omit', 'disconnect', 'missing-handler', 'malformed-response', 'timeout'] satisfies Fault[]) {
  const root = await realpath(await mkdtemp(join(temporary, 'fault-')));
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const fixture = await createHookFixture({ root, judge: fault === 'timeout'
    ? async (...args) => { await gate; return scriptedJudge('FAIL')(...args); } : scriptedJudge('FAIL') });
  try {
    const call = await fixture.register('fault');
    assert.equal((await fixture.run(call, { fault, timeoutMs: 20 })).decision, 'continued-without-assessment');
    await access(call.marker);
    if (fault === 'omit') assert.equal(fixture.serviceRecords.length, 0);
    console.log(`SIMULATED host ${fault}: continued without a valid hook decision; effects=1`);
  } finally { finish(); await fixture.close(); await rm(root, { recursive: true, force: true }); }
}
console.log('Local MCP prototype passed. Dots, enterprise setup, remote transport and complete tool coverage remain UNVERIFIED.');
