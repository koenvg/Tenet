import { TypeSafeClient, APITimeoutError, APIUserAbortError, type Fetch } from '@typesafe-ai/sdk';
import { JudgeFailure, type Judge } from './contracts.js';
import { MODEL, probability, validateAssessment } from './decide.js';
import { jsonCopy } from './evidence.js';
import { assessmentEntries, buildQuestions } from './questions.js';
import { INTEGRITY_ID, INTEGRITY_TEXT } from './policy.js';

export function createJevJudge(options: { apiKey?: string; fetch?: Fetch }): Judge {
  let client: TypeSafeClient | undefined;
  return async (request, signal) => {
    if (!options.apiKey?.trim()) throw new JudgeFailure('missing-credentials');
    try {
      // Explicit destination, model, logging and retry policy prevent SDK env overrides.
      client ??= new TypeSafeClient({ apiKey: options.apiKey, baseURL: 'https://api.typesafe.ai',
        defaultModel: MODEL, logLevel: 'off', retry: { maxRetries: 0 }, fetch: options.fetch });
      const entries = assessmentEntries(request.policy);
      const questions = buildQuestions(request.policy);
      const raw = await client.systemOne({ model: MODEL,
        state: { policy: jsonCopy(request.policy), context: { cwd: request.cwd },
          integrity: { id: INTEGRITY_ID, text: INTEGRITY_TEXT }, action: jsonCopy(request.action) },
        questions,
      }, { signal, timeout: request.deadlineMs, retry: { maxRetries: 0 } });
      if (!raw || typeof raw !== 'object' || !raw.answers || typeof raw.answers !== 'object' || Array.isArray(raw.answers)
          || Object.keys(raw.answers).length !== Object.keys(questions).length
          || !Object.keys(questions).every(key => Object.hasOwn(raw.answers, key))) throw new JudgeFailure('invalid-response');
      const rules = entries.map(entry => {
        const outcome = raw.answers[entry.outcomeKey], evidence = raw.answers[entry.evidenceKey];
        if (outcome?.type !== 'choice' || evidence?.type !== 'choice'
            || !probability(outcome.confidence) || !probability(evidence.confidence)) throw new JudgeFailure('invalid-response');
        return { ruleId: entry.id, outcome, evidence };
      });
      return validateAssessment({ model: raw.model, rules }, request.policy);
    } catch (error) {
      if (error instanceof JudgeFailure) throw error;
      if (signal.aborted || error instanceof APIUserAbortError) throw new JudgeFailure('cancelled');
      if (error instanceof APITimeoutError) throw new JudgeFailure('timeout');
      throw new JudgeFailure('provider-error');
    }
  };
}
