import { JudgeFailure, type Assessment, type JudgeRequest } from './contracts.js';
import { probability, requireChoice, validateAssessment } from './decide.js';
import { ASSESSMENT_METADATA, currentFactReferences } from './assessment-contract.js';
import { assessmentEntries, buildQuestions } from './questions.js';
import { INTEGRITY_ID } from './policy.js';

interface Answer { type?: string; choice?: string; confidence?: number; probabilities?: Record<string, number> }
/** Map a complete canonical choice-answer set. Provider transport and scoring stay outside this function. */
export function assembleAssessment(raw: unknown, request: JudgeRequest): Assessment {
  const value = raw as { model?: unknown; answers?: Record<string, Answer> } | null;
  const questions = buildQuestions(request.policy, request.resolvedAction);
  if (!value || typeof value !== 'object' || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)
    || Object.keys(value.answers).length !== Object.keys(questions).length
    || !Object.keys(questions).every(key => Object.hasOwn(value.answers!, key))) throw new JudgeFailure('invalid-response');
  const answers = value.answers;
  const refs = currentFactReferences(request.resolvedAction);
  const rules = assessmentEntries(request.policy).map(entry => {
    const outcome = answers[entry.outcomeKey], evidence = answers[entry.evidenceKey];
    if (outcome?.type !== 'choice' || evidence?.type !== 'choice') throw new JudgeFailure('invalid-response', 'response-shape');
    if (!probability(outcome.confidence) || !probability(evidence.confidence)) throw new JudgeFailure('invalid-response', 'score-range');
    const facts = answers[entry.factsKey];
    requireChoice(evidence, ['SUFFICIENT', 'INSUFFICIENT']);
    if (entry.id !== INTEGRITY_ID) {
      if (facts?.type !== 'choice') throw new JudgeFailure('invalid-response', 'response-shape');
      if (!probability(facts.confidence)) throw new JudgeFailure('invalid-response', 'score-range');
      requireChoice(facts, ['NONE', ...(refs ? [refs.digest] : [])]);
    }
    return outcome.choice === 'NOT_APPLICABLE' ? { ruleId: entry.id, outcome, evidence: null,
      factReferences: facts?.type === 'choice' && facts.choice === refs?.digest && refs ? refs : { digest: 'NONE', operationIds: [] } }
      : { ruleId: entry.id, outcome, evidence };
  });
  return validateAssessment({ model: value.model, rules, ...ASSESSMENT_METADATA }, request.policy, request);
}
