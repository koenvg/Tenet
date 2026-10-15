import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { OwnerReport } from 'tenet';
import { OwnerReports } from '../src/pi/owner-reports.js';
import { GuardBoundary } from '../src/pi/boundary.js';

type OwnerView = { title: string; items: string[] };
type Command = Parameters<ExtensionAPI['registerCommand']>[1];
const report = (id: string, state: 'pending' | 'completed'): OwnerReport => ({
  invocationId: `invocation-${id}`, callId: id, toolName: 'edit', mode: 'observe', outcome: 'released',
  reason: state === 'pending' ? 'assessment-pending' : 'rule-failed',
  assessmentAvailable: state === 'completed', assessmentStatus: state,
  ...(state === 'pending' ? {} : { wouldDecision: 'BLOCK' }),
  ruleIds: state === 'pending' ? [] : ['r1'], approvalRules: [],
  rules: [{ id: 'r1', line: 1, enforcement: 'BLOCK', text: 'Never commit.',
    origin: { role: 'project', source: '/fixture/TENET.md', target: '/fixture/TENET.md', digest: 'a'.repeat(64), line: 1 } }],
  diagnostics: state === 'pending' ? [] : [{ ruleId: 'r1', enforcement: 'BLOCK', gates: ['rule-fail'], outcome: 'FAIL',
    outcomeProbability: 0.97, evidence: 'SUFFICIENT', evidenceProbability: 0.99, effectThreshold: 0.9, evidenceThreshold: 0.9 }],
});

test('pending owner finding survives 110 later concerns beyond the 100-entry history limit', async () => {
  const views: OwnerView[] = [];
  let command!: Command;
  const pi = { on: () => {}, registerCommand: (_name: string, value: Command) => { command = value; } } as unknown as ExtensionAPI;
  const ctx = { hasUI: true, ui: { select: async (title: string, items: string[]) => {
    views.push({ title, items });
    return undefined;
  } } } as unknown as Parameters<Command['handler']>[1];
  const reports = new OwnerReports('observe', new GuardBoundary(pi, 'observe'),
    { read: () => 'on', write: async () => 'on' }, () => false, () => {});
  reports.register(pi, () => true);
  reports.reset('fixture-ready');
  const list = async () => { await command.handler('', ctx); return views.at(-1)!; };

  const pending = report('first', 'pending');
  reports.add(pending);
  for (let i = 0; i < 110; i++) reports.add(report(`later-${i}`, 'completed'));
  const before = await list();
  assert.equal(before.title, 'TENET ON OBSERVE | fixture-ready | 10 evicted');
  assert.equal(before.items.length, 101);
  assert.match(before.items[0]!, /"first".*released \/ would unknown.*assessment pending$/);
  assert.equal(before.items.filter(item => item.includes('"first"')).length, 1);
  assert.equal(before.items.slice(1).filter(item => /Suspected violation.*would BLOCK.*assessment completed$/.test(item)).length, 100);
  assert.deepEqual(before.items.slice(1).map(item => item.match(/"later-\d+"/)?.[0]),
    Array.from({ length: 100 }, (_, i) => `"later-${109 - i}"`));

  reports.markAssessment(pending.invocationId, 'completed', report('first', 'completed'));
  const after = await list();
  assert.equal(after.title, 'TENET ON OBSERVE | fixture-ready | 11 evicted');
  assert.equal(after.items.length, 100);
  assert.match(after.items[0]!, /Suspected violation.*"first".*released \/ would BLOCK.*assessment completed$/);
  assert.equal(after.items.filter(item => item.includes('"first"')).length, 1);
  assert.deepEqual(after.items.slice(1), before.items.slice(1, -1));
  assert.match(after.items.at(-1)!, /"later-11"/);
});
