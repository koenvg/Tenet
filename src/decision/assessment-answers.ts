import { JudgeFailure, type Assessment, type JudgeRequest, type ApplicabilityRequest, type EvaluationPolicy } from './contracts.js';
import { probability, requireChoice, validateAssessment } from './decide.js';
import { ASSESSMENT_METADATA, currentFactReferences } from './assessment-contract.js';
import { assessmentEntries, buildQuestions, exemptionConfirmation } from './questions.js';
import { INTEGRITY_ID } from './policy.js';
import { prepareJudgeScopes, type JudgeScopes } from './judge-evidence.js';
import type { ConfirmationProvenance, ScopedQuestions } from '../recording/scoped.js';

export interface Answer { type?: string; choice?: string; confidence?: number; probabilities?: Record<string, number> }

interface AssessmentScope {
  readonly group: JudgeScopes['groups'][number];
  readonly questions: ScopedQuestions;
  readonly confirmation: ConfirmationProvenance | undefined;
  readonly factsKey: string | undefined;
  stage(raw: unknown): { model: string; commit(): void };
  acceptAnswer(key: string, model: string, answer: unknown): void;
}

export function openScopedAssessment(request: JudgeRequest) {
  const plan = request.judgeScopes ?? prepareJudgeScopes(request);
  if (!plan) throw new JudgeFailure('insufficient-evidence');
  const questions = buildQuestions(request.policy, request.resolvedAction);
  const answers: Record<string, Answer> = Object.create(null);
  let index = 0, failed = false;
  let active: AssessmentScope | undefined;
  const invalid = (): never => { failed = true; throw new JudgeFailure('invalid-response'); };

  return {
    plan, questions,
    current(): AssessmentScope | undefined {
      if (failed) return invalid();
      if (active) return active;
      const group = plan.groups[index];
      if (!group) return undefined;
      const selected = groupQuestions(plan, group, questions, answers);
      const keys = Object.keys(selected.questions);
      let accepted = 0, staged = false;
      const check = () => { if (failed || active !== scope) invalid(); };
      const retain = (next: Record<string, Answer>) => {
        check();
        Object.assign(answers, next);
        accepted += Object.keys(next).length;
        if (accepted === keys.length) {
          try { validateConfirmation(selected.confirmation, answers, group.questionKeys[0]!); }
          catch (error) { failed = true; throw error; }
          index++;
          active = undefined;
        }
      };
      const scope: AssessmentScope = {
        group, ...selected,
        factsKey: plan.entries.find(entry => entry.id === group.ruleId)?.factsKey,
        stage(raw) {
          check();
          if (staged || accepted !== 0) return invalid();
          try {
            const validated = validateGroupAnswers(raw, selected.questions);
            staged = true;
            return { model: validated.model, commit: () => retain(validated.answers) };
          } catch (error) { failed = true; throw error; }
        },
        acceptAnswer(key, model, answer) {
          check();
          if (staged || keys[accepted] !== key) return invalid();
          try {
            const validated = validateGroupAnswers({ model, answers: { [key]: answer } }, { [key]: selected.questions[key]! });
            retain(validated.answers);
          } catch (error) { failed = true; throw error; }
        },
      };
      active = scope;
      return scope;
    },
    finish(model: string): Assessment {
      if (failed || index !== plan.groups.length) return invalid();
      return assembleScopedAssessment(model, answers, request, plan, questions);
    },
  };
}
/** Map a complete canonical choice-answer set. Provider transport and scoring stay outside this function. */
export function assembleAssessment(raw: unknown, request: JudgeRequest): Assessment {
  return assembleRecordedAssessment(raw, buildQuestions(request.policy, request.resolvedAction),
    assessmentEntries(request.policy), request.policy, request);
}
/** Decode against the submitted mapping, without reading current policy files or rebuilding history. */
export function assembleRecordedAssessment(raw: unknown, questions: Record<string, unknown>,
  entries: ReturnType<typeof assessmentEntries>, policy: EvaluationPolicy, request: ApplicabilityRequest): Assessment {
  const value = raw as { model?: unknown; answers?: Record<string, Answer> } | null;
  if (!value || typeof value !== 'object' || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)
    || Object.keys(value.answers).length !== Object.keys(questions).length
    || !Object.keys(questions).every(key => Object.hasOwn(value.answers!, key))) throw new JudgeFailure('invalid-response');
  const answers = value.answers;
  const refs = currentFactReferences(request.resolvedAction);
  const rules = entries.map(entry => {
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
  return validateAssessment({ model: value.model, rules, ...ASSESSMENT_METADATA }, policy, request);
}


/** Validate exactly one submitted group before retaining any of its answers. */
function validateGroupAnswers(raw: unknown, questions: Record<string, { criteria: Record<string, string> }>) {
  const value = raw as { model?: unknown; answers?: Record<string, Answer> } | null;
  if (!value || typeof value !== 'object' || typeof value.model !== 'string' || !value.model.trim()
    || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)
    || Object.keys(value.answers).length !== Object.keys(questions).length
    || !Object.keys(questions).every(key => Object.hasOwn(value.answers!, key))) throw new JudgeFailure('invalid-response');
  for (const [key, question] of Object.entries(questions)) {
    const answer = value.answers[key]!;
    if (answer?.type !== 'choice') throw new JudgeFailure('invalid-response');
    if (!probability(answer.confidence)) throw new JudgeFailure('invalid-response', 'score-range');
    requireChoice(answer, Object.keys(question.criteria));
  }
  return { model: value.model, answers: value.answers };
}

/** Only protected confirmation may replace an ordinary exemption distribution. */
function assembleScopedAssessment(model: string, answers: Record<string, Answer>, request: JudgeRequest,
  plan: JudgeScopes, questions: ScopedQuestions) {
  const finalAnswers = { ...answers };
  const refs = currentFactReferences(request.resolvedAction);
  for (const [i, entry] of plan.entries.entries()) {
    if (entry.id === INTEGRITY_ID) continue;
    const key = `rule_${i}_confirmation`, confirmation = answers[key];
    const required = answers[entry.outcomeKey]?.choice === 'NOT_APPLICABLE' && plan.exemptionSupported;
    if (required) {
      if (!refs || confirmation?.choice !== 'NOT_APPLICABLE' || answers[entry.factsKey]?.choice !== refs.digest)
        throw new JudgeFailure('invalid-response');
      finalAnswers[entry.outcomeKey] = confirmation;
    } else if (confirmation) throw new JudgeFailure('invalid-response');
    delete finalAnswers[key];
  }
  return assembleRecordedAssessment({ model, answers: finalAnswers }, questions, plan.entries, request.policy, request);
}


function groupQuestions(plan: JudgeScopes, group: JudgeScopes['groups'][number],
  questions: ScopedQuestions, answers: Record<string, Answer>) {
  const selected = Object.fromEntries(group.questionKeys.map(key => [key, questions[key]!]));
  const index = plan.entries.findIndex(e => e.id === group.ruleId), entry = plan.entries[index]!;
  const refs = group.kind === 'exemption' ? (group.state as { allowedFactReferences: { digest: string } | null }).allowedFactReferences : null;
  if (group.kind === 'exemption' && plan.exemptionSupported && refs && answers[entry.outcomeKey]?.choice === 'NOT_APPLICABLE') {
    const key = `rule_${index}_confirmation`;
    selected[key] = exemptionConfirmation();
    return { questions: selected, confirmation: { ordinaryQuestion: entry.outcomeKey, confirmationQuestion: key,
      trigger: 'NOT_APPLICABLE' as const, factsReference: refs.digest } };
  }
  return { questions: selected, confirmation: undefined };
}


function validateConfirmation(confirmation: ConfirmationProvenance | undefined,
  answers: Record<string, Answer>, factsKey: string) {
  if (confirmation && (answers[confirmation.confirmationQuestion]?.choice !== 'NOT_APPLICABLE'
    || answers[factsKey]?.choice !== confirmation.factsReference)) throw new JudgeFailure('invalid-response');
}
