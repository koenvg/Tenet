import type { EvidenceLimits, JudgeRequest, PolicySet } from '../src/decision/contracts.js';
import type { ResolvedAction } from '../src/runtime/resolved-action.js';
import { prepareRequest, serializedBytes } from '../src/decision/history-selection.js';
import { judgeState } from '../src/decision/judge-evidence.js';
import { evidenceContext } from '../src/decision/evidence-context.js';
import { freeze } from '../src/decision/evidence.js';
import { assessmentEntries, currentFactReferences } from '../src/decision/assessment-contract.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import frozen from '../test/fixtures/judge-prompts/v8-read-00.json' with { type: 'json' };

// Offline historical replay only. This is not a judge, transport, current comparison
// tool or production switch. Never label a shared-state replay as scoped v9.
export const HISTORICAL_QUESTION_VERSION = frozen.questionVersion;
export function boundHistoricalEvidence(request: JudgeRequest, limits?: EvidenceLimits): JudgeRequest | null {
  const bounded = prepareRequest(request, r => serializedBytes(judgeState(r)), limits);
  return bounded ? freeze({ ...bounded, evidenceContext: evidenceContext(bounded, limits, true) }) : null;
}

export function historicalQuestions(policy: PolicySet, resolved?: ResolvedAction) {
  const refs = currentFactReferences(resolved);
  return Object.fromEntries(assessmentEntries(policy).flatMap(entry => {
    const template = entry.id === INTEGRITY_ID ? 'rule_1' : 'rule_0';
    const questions = frozen.questions as Record<string, { type: string; instructions: string; criteria: Record<string, string> }>;
    const outcome = structuredClone(questions[`${template}_outcome`]!);
    const evidence = structuredClone(questions[`${template}_evidence`]!);
    if (entry.id === INTEGRITY_ID) return [[entry.outcomeKey, outcome], [entry.evidenceKey, evidence]];
    const facts = structuredClone(questions.rule_0_facts!);
    for (const question of [outcome, evidence, facts]) {
      question.instructions = question.instructions.replaceAll('state.policy.rules[0].text', entry.reference);
    }
    if (refs) facts.criteria[refs.digest] = `state.resolvedAction, every operation: ${JSON.stringify(refs.operationIds)}`;
    return [[entry.outcomeKey, outcome], [entry.evidenceKey, evidence], [entry.factsKey, facts]];
  }));
}
