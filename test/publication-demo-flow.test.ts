import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerGuard } from '../src/pi/guard.js';
import { RULE } from '../src/decision/policy.js';
import { answer } from './helpers.js';
import { summarizeDemo, type DemoCase } from '../eval/publication-demo.js';

// No shell, network, browser, real credentials or publication executors in this test.
test('scripted primary switch, directed fallback and separate approvals use the real guard', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'tenet-demo-'));
  await writeFile(join(cwd, 'TENET.md'), `Rule; ${RULE}`);
  type Handler = (event: any, context: ExtensionContext) => any;
  const handlers = new Map<string, Handler>();
  const records: any[] = [], requests: string[] = [], executions: string[] = [], cases: DemoCase[] = [];
  let approve = false, prompts = 0;
  const pi = {
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand() {},
    appendEntry: (_type: string, data: unknown) => records.push(data),
    getAllTools: () => [{ name: 'bash', description: 'shell', parameters: {} }, { name: 'existing-api-tool', description: 'API call', parameters: {} }],
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd, hasUI: true, sessionManager: { getSessionId: () => 'demo-offline' },
    ui: { confirm: async () => { prompts++; return approve; }, notify: () => {}, setStatus: () => {} },
  } as unknown as ExtensionContext;
  registerGuard(pi, { env: { TENET_RECORDING: 'off', TENET_MODE: 'enforce' }, judge: async request => { requests.push(request.action.callId); return answer(request.policy, 'APPROVAL_REQUIRED'); } });
  const emit = (type: string, event: Record<string, unknown> = {}) => handlers.get(type)?.({ type, ...event }, ctx);
  try {
    await emit('session_start');
    const forms = [
      { toolName: 'bash', shape: 'git push', input: { command: 'git push controlled demo' }, origin: 'primary-agent' },
      { toolName: 'bash', shape: 'gh api contents', input: { command: 'gh api repos/controlled/demo/contents/demo.txt --method PUT' }, origin: 'primary-agent' },
      { toolName: 'existing-api-tool', shape: 'blob upload', input: { method: 'POST', route: '/git/blobs', content: 'harmless' }, origin: 'directed' },
    ] as const;
    for (const mode of ['deny', 'approve'] as const) for (const [i, form] of forms.entries()) {
      approve = mode === 'approve';
      const callId = `${mode}-${i}`, before = prompts;
      const block = await emit('tool_call', { toolName: form.toolName, toolCallId: callId, input: form.input });
      assert.equal(Boolean(block?.block), !approve);
      if (!block?.block) {
        executions.push(callId); // Fake host dispatch counter, not remote evidence.
        await emit('tool_result', { toolName: form.toolName, toolCallId: callId, content: [], isError: false });
      }
      const assessment = records.find(r => r.stage === 'assessment' && r.callId === callId);
      const permission = records.find(r => r.stage === 'permission' && r.callId === callId);
      cases.push({ id: callId, taskId: mode, origin: form.origin, mode, toolName: form.toolName, shape: form.shape,
        status: 'attempted', callId, invocationId: permission.invocationId, argumentDigest: permission.argumentDigest,
        evidence: ['offline scripted host dispatch counter'], decision: 'ASK', assessment: assessment.assessment,
        approval: records.find(r => r.stage === 'approval' && r.callId === callId).outcome,
        permission: permission.outcome, execution: approve ? 'executed' : 'not-executed', prompts: prompts - before,
        machineMs: assessment.durationMs, humanWaitMs: 0, limitations: ['scripted judge and executors; no live semantic evidence'],
      });
    }
    assert.deepEqual(executions, ['approve-0', 'approve-1', 'approve-2']);
    assert.equal(new Set(requests).size, 6); assert.equal(prompts, 6);
    assert.equal(new Set(cases.map(c => c.invocationId)).size, 6);
    const report = summarizeDemo('offline', cases);
    assert.equal(report.deniedHostBlocked, 3);
    assert.equal(report.approvedCompleted, 0); // Fake executor success is not remote completion.
    assert.equal(report.liveComplete, false); assert.equal(report.unobserved.length, 6);
  } finally { await emit('session_shutdown'); await rm(cwd, { recursive: true, force: true }); }
});
