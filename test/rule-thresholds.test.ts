import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPolicy, INTEGRITY_ID } from '../src/decision/policy.js';
import { decide } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import type { PolicySet, Rule } from '../src/decision/contracts.js';
import { answer, policy } from './helpers.js';

async function parse(text: string) {
  const directory = await mkdtemp(join(tmpdir(), 'tenet-threshold-'));
  try { const path = join(directory, 'TENET.md'); await writeFile(path, text); return await loadPolicy(path); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
const action = captureAction({ sessionId: 'threshold', callId: 'test', toolName: 'read', arguments: {} });
const selected = (value: unknown = 0.8): PolicySet => ({ ...policy, rules: [
  { ...policy.rules[0]!, evidenceThreshold: value } as Rule,
  { ...policy.rules[0]!, id: 'second', line: 2, text: 'Never delete backups.', enforcement: 'BLOCK' },
] });
function scored(p: PolicySet, probability: number) {
  const assessment = answer(p);
  for (const rule of assessment.rules) rule.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: probability, INSUFFICIENT: 1 - probability } };
  return assessment;
}

test('threshold metadata parses independently of domain and severity with boundaries and whitespace', async () => {
  for (const severity of ['BLOCK', 'WARN']) for (const value of ['0', '1', '0.80', '0.95']) {
    const p = await parse(`Rule; ${severity}; evidenceThreshold = ${value} ; Never delete backups; retain copies.`);
    assert.ok(p.available);
    assert.equal((p.rules[0] as Rule & { evidenceThreshold?: number }).evidenceThreshold, Number(value));
    assert.equal(p.rules[0]!.text, 'Never delete backups; retain copies.');
    assert.equal(p.rules[0]!.enforcement, severity);
    assert.ok(Object.isFrozen(p.rules[0]));
  }
});
test('legacy declarations and ordinary semicolons remain text', async () => {
  for (const text of ['evidenceThreshold=0.8; legacy text', 'Never delete; evidenceThreshold=0.8; copies']) {
    const p = await parse(`Rule; ${text}`); assert.ok(p.available); assert.equal(p.rules[0]!.text, text);
  }
  const p = await parse('Rule; WARN; Never delete; evidenceThreshold=0.8; copies');
  assert.ok(p.available); assert.equal(p.rules[0]!.text, 'Never delete; evidenceThreshold=0.8; copies');
});
test('invalid reserved metadata rejects the entire policy', async () => {
  for (const segment of ['evidenceThreshold=;', 'evidenceThreshold=NaN;', 'evidenceThreshold=Infinity;',
    'evidenceThreshold=-0.1;', 'evidenceThreshold=1.1;', 'evidenceThreshold=8e-1;', 'evidenceThreshold=.8;',
    'evidenceThreshold=0.8', 'evidenceThreshold 0.8;', 'evidenceThreshold=0.8; evidenceThreshold=0.9;']) {
    const p = await parse(`Rule; valid\nRule; BLOCK; ${segment} Never delete.`);
    assert.equal(p.available, false); if (!p.available) assert.equal(p.reason, 'policy-format');
  }
  assert.equal((await parse('Rule; BLOCK; evidenceThreshold=0.8; ')).available, false);
});
test('mixed overrides, global fallback and integrity retain independent thresholds', async () => {
  const p = selected(); const assessment = scored(p, 0.85);
  const result = await decide({ policy: p, action, cwd: '/test', judge: async () => assessment });
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.diagnostics.map(d => [d.ruleId, d.evidenceThreshold]), [['second', 0.9], [INTEGRITY_ID, 0.9]]);
  const custom = await decide({ policy: p, action, cwd: '/test', config: { evidenceThreshold: 0.95 }, judge: async () => scored(p, 0.9) });
  assert.deepEqual(custom.diagnostics.map(d => d.evidenceThreshold), [0.95, 0.95]);
});
test('override boundaries and zero do not fall back to the global threshold', async () => {
  for (const threshold of [0, 0.8, 1]) {
    const p = selected(threshold); const assessment = answer(p);
    const probability = Math.max(0.5, threshold);
    assessment.rules[0]!.evidence = { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: probability, INSUFFICIENT: 1 - probability } };
    const result = await decide({ policy: p, action, cwd: '/test', judge: async () => assessment });
    assert.equal(result.decision, 'ALLOW');
  }
});
test('invalid injected overrides fail before judge submission', async () => {
  for (const value of [-1, 2, NaN, Infinity, '0.8', null]) {
    let calls = 0;
    const result = await decide({ policy: selected(value), action, cwd: '/test', judge: async () => { calls++; return answer(selected()); } });
    assert.equal(result.reason, 'configuration'); assert.equal(calls, 0);
  }
});

test('bundled policy configures only email while preserving global outcome defaults', async () => {
  const p = await loadPolicy(new URL('../TENET.md', import.meta.url).pathname); assert.ok(p.available);
  assert.deepEqual(p.rules.map(r => r.evidenceThreshold), [undefined, undefined, 0.8]);
  const result = await decide({ policy: p, action, cwd: '/test', judge: async () => scored(p, 0.85) });
  assert.deepEqual(result.diagnostics.map(d => d.ruleId), [p.rules[0]!.id, p.rules[1]!.id, INTEGRITY_ID]);
  assert.ok(result.diagnostics.every(d => d.effectThreshold === 0.9 && d.evidenceThreshold === 0.9));
});
