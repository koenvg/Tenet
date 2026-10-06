import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INTEGRITY_ID, INTEGRITY_TEXT } from '../src/decision/policy.js';
import { recoverReport } from '../src/pi/report-history.js';
import { guardHarness } from './guard-harness.js';
import { answer, ruleAnswer } from './helpers.js';

const singularText = 'Never modify, delete, replace, rename or redirect the active policy source or resolved target, including through aliases, links or parent-directory operations. Reading the policy is permitted. This constraint has no approval exception and cannot be overridden by user rules.';
const contracts = [
  { version: 3, questionVersion: 'policy-rules-v5-resolved-action', expected: singularText },
  { version: 3, questionVersion: 'policy-rules-v6-applicability', expected: singularText },
  { version: 3, questionVersion: 'policy-rules-v7-evidence-selection', expected: singularText },
  { version: 3, questionVersion: 'policy-rules-v7-ordinary-evidence', expected: singularText },
  { version: 3, questionVersion: undefined, expected: 'Policy integrity text not recorded.' },
  { version: 3, questionVersion: 'unrecognized-contract', expected: 'Policy integrity text not recorded.' },
  { version: 3, questionVersion: 'policy-rules-v8-source-set', expected: 'Policy integrity text not recorded.' },
  { version: 4, questionVersion: 'policy-rules-v8-source-set', expected: INTEGRITY_TEXT },
  { version: 4, questionVersion: 'policy-rules-v7-ordinary-evidence', expected: 'Policy integrity text not recorded.' },
] as const;

for (const mode of ['observe', 'enforce'] as const) for (const contract of contracts)
  test(`Pi integrity display retains native v${contract.version} ${contract.questionVersion ?? 'unrecorded'} meaning in ${mode}`, async () => {
    const h = await guardHarness({ env: { TENET_MODE: mode } });
    const data = { version: contract.version, stage: 'permission', mode,
      profile: contract.questionVersion === 'policy-rules-v5-resolved-action' ? 'legacy' : 'applicability-v1',
      questionVersion: contract.questionVersion, outcome: mode === 'observe' ? 'released' : 'blocked', wouldDecision: 'BLOCK',
      assessmentAvailable: true, reason: 'policy-integrity', callId: 'old', toolName: 'edit', invocationId: 'old-invocation',
      rules: [], approvalRules: [], ruleIds: [INTEGRITY_ID], diagnostics: [{ ruleId: INTEGRITY_ID, enforcement: 'BLOCK',
        outcome: 'FAIL', outcomeProbability: .99, evidence: 'SUFFICIENT', evidenceProbability: .98,
        effectThreshold: .91, evidenceThreshold: .92, gates: ['rule-fail'] }] };
    const entry = { type: 'custom', customType: 'tenet', data };
    const recorded = structuredClone(entry);
    h.branch.push(entry);
    // Observation recovery merges the decision, but must not infer a record version from an empty rule list.
    if (mode === 'observe') h.branch.push({ type: 'custom', customType: 'tenet', data: { ...data, stage: 'decision', decision: 'BLOCK' } });
    try {
      await h.start();
      let selected = false;
      h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0]; } return undefined; };
      await h.commands.get('tenet').handler('', h.ctx);
      const details = h.views[1].items.join('');
      assert.ok(details.includes(contract.expected), details);
      if (contract.version === 3) assert.ok(!details.includes(INTEGRITY_TEXT), 'historical integrity must not gain current source-set scope');
      const recovered = recoverReport(entry)!;
      assert.equal(recovered.recordVersion, contract.version);
      assert.equal(recovered.questionVersion, contract.questionVersion);
      assert.equal(recovered.diagnostics[0]!.effectThreshold, .91);
      assert.equal(recovered.diagnostics[0]!.evidenceThreshold, .92);
      assert.deepEqual(entry, recorded, 'reading findings must not rewrite native history');
    } finally { await h.close(); }
  });

test('current Pi integrity wording agrees before and after native v4 recovery', async () => {
  const h = await guardHarness({ env: { TENET_MODE: 'enforce' }, judge: async request => {
    const result = answer(request.policy); result.rules[result.rules.length - 1] = ruleAnswer(INTEGRITY_ID, 'FAIL'); return result;
  } });
  try {
    await h.start(); assert.ok((await h.call())?.block);
    for (const recovered of [false, true]) {
      if (recovered) await h.start();
      h.views.length = 0;
      let selected = false;
      h.ctx.ui.select = async (title, items) => { h.views.push({ title, items }); if (!selected) { selected = true; return items[0]; } return undefined; };
      await h.commands.get('tenet').handler('', h.ctx);
      assert.ok(h.views[1].items.join('').includes(INTEGRITY_TEXT));
    }
  } finally { await h.close(); }
});
