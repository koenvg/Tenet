import { TypeSafeClient, APITimeoutError, APIUserAbortError, type Fetch } from '@typesafe-ai/sdk';
import { JudgeFailure, type Judge, type Json } from './contracts.js';
import { MODEL } from './typesafe-contract.js';
import { assembleScopedAssessment, validateGroupAnswers, validateConfirmation, groupQuestions, type Answer } from './assessment-answers.js';
import { prepareJudgeScopes } from './judge-evidence.js';
import { buildQuestions } from './questions.js';
import { capture, responseSnapshot } from '../recording/contract.js';
import { freeze, jsonCopy } from './evidence.js';
import { captureScopedPlan, captureScopedSubmission } from '../recording/scoped-capture.js';
import { assessmentBudget } from './assessment-budget.js';

export function createJevJudge(options: { apiKey?: string; fetch?: Fetch }): Judge {
  let client: TypeSafeClient | undefined;
  return async (request, signal, recording) => {
    if (!options.apiKey?.trim()) {
      capture(recording, 'validation', () => ({ valid: false, reason: 'missing-credentials', request: 'not-submitted' }));
      throw new JudgeFailure('missing-credentials');
    }
    const budget = assessmentBudget(request.deadlineMs, signal);
    let submitted = false;
    try {
      budget.check();
      // Explicit destination, model, logging and retry policy prevent SDK env overrides.
      client ??= new TypeSafeClient({ apiKey: options.apiKey, baseURL: 'https://api.typesafe.ai',
        defaultModel: MODEL, logLevel: 'off', retry: { maxRetries: 0 }, fetch: options.fetch });
      const plan = request.judgeScopes ?? prepareJudgeScopes(request);
      if (!plan) throw new JudgeFailure('insufficient-evidence');
      const questions = buildQuestions(request.policy, request.resolvedAction);
      captureScopedPlan(recording, request, plan, questions, { provider: 'typesafe', model: MODEL });
      const answers: Record<string, Answer> = Object.create(null);
      let model: string | undefined;
      for (const group of plan.groups) {
        budget.check();
        const selected = groupQuestions(plan, group, questions, answers);
        const payload = freeze({ model: MODEL, state: jsonCopy(group.state) as Record<string, Json>, questions: selected.questions });
        const submission = { submissionId: group.id, scopeId: group.id, questionKeys: Object.keys(selected.questions),
          payloadJson: JSON.stringify(payload), ...(selected.confirmation ? { confirmation: selected.confirmation } : {}) };
        try {
          budget.check();
          submitted = true;
          captureScopedSubmission(recording, { ...submission, status: 'attempted' });
          const raw = await budget.bounded(() => client!.systemOne(payload, {
            signal: budget.signal, timeout: budget.remaining(), retry: { maxRetries: 0 },
          }));
          budget.check();
          capture(recording, 'response', () => ({ scopeId: group.id, ...responseSnapshot(raw) }));
          const validated = validateGroupAnswers(raw, selected.questions);
          if (model !== undefined && validated.model !== model) throw new JudgeFailure('invalid-response');
          model = validated.model;
          Object.assign(answers, validated.answers);
          validateConfirmation(selected.confirmation, answers, group.questionKeys[0]!);
          captureScopedSubmission(recording, { ...submission, status: 'completed' });
        } catch (error) {
          captureScopedSubmission(recording, { ...submission, status: 'unavailable',
            reason: error instanceof JudgeFailure ? error.reason : error instanceof APITimeoutError ? 'timeout' : 'provider-error' });
          throw error;
        }
      }
      budget.check();
      const assessment = assembleScopedAssessment(model!, answers, request, plan, questions);
      budget.check();
      capture(recording, 'validation', () => ({ valid: true, assessment }));
      return assessment;
    } catch (error) {
      const failure = error instanceof JudgeFailure ? error
        : new JudgeFailure(signal.aborted || error instanceof APIUserAbortError ? 'cancelled'
          : error instanceof APITimeoutError ? 'timeout' : 'provider-error');
      capture(recording, 'validation', () => ({ valid: false, reason: failure.reason,
        ...(failure.reason === 'invalid-response' ? { validationIssue: failure.validationIssue ?? 'response-shape' } : {}),
        request: submitted ? 'submitted' : 'not-submitted' }));
      throw failure;
    } finally { budget.close(); }
  };
}
