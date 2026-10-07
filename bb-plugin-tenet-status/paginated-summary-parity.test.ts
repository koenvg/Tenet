import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import { FixtureArchiveWriter } from '../test/archive-fixture.js';
import { answer } from '../test/helpers.js';
import { ArchiveIndex } from '../src/inspector/archive-index.js';
import { validRecord } from '../src/recording/contract.js';
import { loadPolicy } from '../src/decision/policy.js';
import { policyEvidence, policyIntegrity } from '../src/decision/policy-contract.js';
import { invocationView } from '../src/inspector/view.js';
import { standaloneSummary } from '../inspector/src/shared/standalone-adapter.js';
import { decisionReason, explainDecision } from '../inspector/src/presentation.js';
import DecisionSummary from '../inspector/src/DecisionSummary.js';
import { overviewSchema } from './overview-contract.js';
import hostEntry from './host.js';

for (const schema of [3, 4, 5] as const) for (const scenario of ['integrity', 'uncertainty', 'multiple blockers'] as const)
  test(`schema-${schema} ${scenario} explanation stays recorded across both rule-page directions`, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tenet-page-parity-')));
    const host = experimental_createHostEntryHarness(hostEntry);
    const threadId = 'thr_pageparityfixture', sentinel = 'PRIVATE-PAGED-SOURCE';
    try {
      const file = join(root, 'TENET.md');
      await writeFile(file, Array.from({ length: 16 }, (_, n) => `Rule; Recorded constraint ${n}.`).join('\n'));
      const current = schema === 5 ? await loadPolicy(file) : null;
      if (current) assert.ok(current.available);
      const policy = current ?? { digest: 'a'.repeat(64), rules: Array.from({ length: 16 }, (_, n) => ({ id: `rule-${n}`, text: `Recorded rule ${n}.`, line: n + 1, enforcement: 'BLOCK' })) };
      const integrity = current ? policyIntegrity(current) : { id: 'integrity', text: 'Recorded integrity.' };
      const writer = new FixtureArchiveWriter({ enabled: true, directory: join(root, 'archive') });
      const identity = { sessionId: 'paged', invocationId: 'paged', callId: 'paged', toolName: 'bash',
        cwd: root, host: 'pi', contextId: 'main', bbThreadId: threadId, mode: 'enforce' as const };
      const sink = schema === 5 ? writer.bind(identity) : writer.bindHistorical(identity, schema);
      const result = (ruleId: string) => ({ ruleId,
        outcome: { choice: 'PASS', probabilities: { PASS: 1, FAIL: 0, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } },
        evidence: { choice: 'SUFFICIENT', probabilities: { SUFFICIENT: 1, INSUFFICIENT: 0 } } });
      const assessment = current ? answer(current) : { profile: 'legacy', model: 'scripted', rules: [...policy.rules.map(rule => result(rule.id)), result(integrity.id)] };
      const violation = scenario !== 'uncertainty', gate = violation ? 'rule-fail' : 'outcome-confidence-below-threshold';
      const last = assessment.rules.at(-1)!;
      last.outcome = { ...last.outcome, choice: violation ? 'FAIL' : 'PASS',
        probabilities: { ...last.outcome.probabilities, PASS: violation ? 0 : .7, FAIL: violation ? 1 : .3, UNKNOWN: 0, APPROVAL_REQUIRED: 0 } };
      const contributions = [{ ruleId: integrity.id, gates: [gate], contribution: 'blocking-gates', effectThreshold: .9,
        evidenceThreshold: .9, evidenceGate: 'applicable', profile: assessment.profile }];
      if (scenario === 'multiple blockers') {
        const first = assessment.rules[0]!; first.outcome.probabilities.PASS = .7; first.outcome.probabilities.FAIL = .3;
        contributions.unshift({ ...contributions[0]!, ruleId: first.ruleId, gates: ['outcome-confidence-below-threshold'] });
      }
      sink('begin', { policy, integrity, config: { effectThreshold: .9, evidenceThreshold: .9, assessmentProfile: assessment.profile }, arguments: sentinel });
      sink('request', { policy, payload: { model: 'scripted', state: { action: { arguments: sentinel },
        policy: current ? policyEvidence(current) : {}, context: {}, trajectory: {}, integrity }, questions: { q: sentinel } },
        questionVersion: current ? 'policy-rules-v8-source-set' : 'recorded-v3', mapping: [] });
      sink('response', { bytes: sentinel.length, truncated: false, value: sentinel });
      sink('validation', { valid: true }); sink('assessment', { assessment });
      sink('decision', { decision: 'BLOCK', reason: violation ? 'policy-integrity' : 'insufficient-evidence', contributions });
      sink('permission', { outcome: 'blocked' }); await writer.complete();
      const index = new ArchiveIndex(join(root, 'archive')); await index.refresh();
      const session = index.sessions().items[0]!, call = index.invocations(session.id).items[0]!;
      const { records } = await index.detail(session.id, call.id, threadId);
      assert.ok(records.length >= 7); assert.ok(records.every(record => record.schemaVersion === schema && validRecord(record)));
      const standalone = standaloneSummary(invocationView(records));
      const expected = scenario === 'integrity' ? 'The built-in integrity check reported a violation.'
        : scenario === 'uncertainty' ? 'No rule was classified as violated. The assessment is uncertain.'
        : 'Confidence in a rule outcome was below the required threshold.';
      assert.equal(decisionReason(standalone), expected);
      assert.equal(standalone.noRulesClassifiedViolated, !violation);
      if (scenario === 'multiple blockers') assert.ok(explainDecision(standalone).includes('2 rules contribute blocking gates.'));
      const first = overviewSchema.parse(await host.experimental_call('readOverview', { threadId, recordingDirectory: join(root, 'archive') }));
      assert.equal(first.selected!.rules.length, 16); assert.ok(!first.selected!.rules.some(rule => rule.builtin));
      const selection = { threadId, recordingDirectory: join(root, 'archive'), sessionId: first.sessionId!, callId: first.selectedId! };
      const second = overviewSchema.parse(await host.experimental_call('readOverview', { ...selection, ruleCursor: first.selected!.rulePage!.next! }));
      assert.equal(second.selected!.rules.length, 1); assert.equal(second.selected!.rules[0]!.builtin, true);
      const again = overviewSchema.parse(await host.experimental_call('readOverview', selection));
      for (const page of [first, second, again]) {
        assert.equal(decisionReason(page.selected!), expected);
        assert.equal(explainDecision(page.selected!), explainDecision(standalone));
        assert.deepEqual(page.selected!.explanation, standalone.explanation);
        assert.equal(renderToStaticMarkup(createElement(DecisionSummary, { view: page.selected! })), renderToStaticMarkup(createElement(DecisionSummary, { view: standalone })));
        assert.ok(!JSON.stringify(page).includes(sentinel));
      }
      assert.throws(() => overviewSchema.parse({ ...first, selected: { ...first.selected,
        explanation: { ...first.selected!.explanation, raw: sentinel } } }));
      assert.throws(() => overviewSchema.parse({ ...first, selected: { ...first.selected,
        explanation: { ...first.selected!.explanation, firstBlocker: { ...first.selected!.explanation.firstBlocker, text: sentinel } } } }));
    } finally { await host.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
  });
