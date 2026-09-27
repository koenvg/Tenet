import { TypeSafeClient, APITimeoutError, APIUserAbortError, type Fetch } from '@typesafe-ai/sdk';
import { JudgeFailure, type Judge } from './contracts.js';
import { MODEL, probability, validateAssessment } from './decide.js';
import { judgeState } from './judge-evidence.js';
import { assessmentEntries, buildQuestions } from './questions.js';
import { capture, responseSnapshot } from '../recording/contract.js';
import { freeze } from './evidence.js';
import { validChoice } from './decide.js';
import { ASSESSMENT_METADATA, currentFactReferences } from './assessment-contract.js';
import { INTEGRITY_ID } from './policy.js';

export function createJevJudge(options: { apiKey?: string; fetch?: Fetch }): Judge {
  let client: TypeSafeClient | undefined;
  return async (request, signal, recording) => {
    if (!options.apiKey?.trim()) {
      capture(recording, 'validation', () => ({ valid: false, reason: 'missing-credentials', request: 'not-submitted' }));
      throw new JudgeFailure('missing-credentials');
    }
    let submitted = false;
    try {
      // Explicit destination, model, logging and retry policy prevent SDK env overrides.
      client ??= new TypeSafeClient({ apiKey: options.apiKey, baseURL: 'https://api.typesafe.ai',
        defaultModel: MODEL, logLevel: 'off', retry: { maxRetries: 0 }, fetch: options.fetch });
      const entries = assessmentEntries(request.policy);
      const refs = currentFactReferences(request.resolvedAction);
      const questions = buildQuestions(request.policy, request.resolvedAction);
      const payload = freeze({ model: MODEL, state: judgeState(request), questions });
      submitted = true;
      capture(recording, 'request', () => ({ payload, policy: request.policy, mapping: entries, ...ASSESSMENT_METADATA }));
      const raw = await client.systemOne(payload, { signal, timeout: request.deadlineMs, retry: { maxRetries: 0 } });
      capture(recording, 'response', () => responseSnapshot(raw));
      if (!raw || typeof raw !== 'object' || !raw.answers || typeof raw.answers !== 'object' || Array.isArray(raw.answers)
          || Object.keys(raw.answers).length !== Object.keys(questions).length
          || !Object.keys(questions).every(key => Object.hasOwn(raw.answers, key))) throw new JudgeFailure('invalid-response');
      const rules = entries.map(entry => {
        const outcome = raw.answers[entry.outcomeKey], evidence = raw.answers[entry.evidenceKey];
        if (outcome?.type !== 'choice' || evidence?.type !== 'choice'
            || !probability(outcome.confidence) || !probability(evidence.confidence)) throw new JudgeFailure('invalid-response');
        const facts = raw.answers[entry.factsKey];
        if (!validChoice(evidence, ['SUFFICIENT', 'INSUFFICIENT'])) throw new JudgeFailure('invalid-response');
        if (entry.id !== INTEGRITY_ID && (facts?.type !== 'choice' || !probability(facts.confidence)
          || !validChoice(facts, ['NONE', ...(refs ? [refs.digest] : [])]))) throw new JudgeFailure('invalid-response');
        return outcome.choice === 'NOT_APPLICABLE' ? { ruleId: entry.id, outcome, evidence: null,
          factReferences: facts?.type === 'choice' && facts.choice === refs?.digest && refs ? refs : { digest: 'NONE', operationIds: [] } }
          : { ruleId: entry.id, outcome, evidence };
      });
      const assessment = validateAssessment({ model: raw.model, rules, ...ASSESSMENT_METADATA }, request.policy, request);
      capture(recording, 'validation', () => ({ valid: true, assessment }));
      return assessment;
    } catch (error) {
      const failure = error instanceof JudgeFailure ? error
        : new JudgeFailure(signal.aborted || error instanceof APIUserAbortError ? 'cancelled'
          : error instanceof APITimeoutError ? 'timeout' : 'provider-error');
      capture(recording, 'validation', () => ({ valid: false, reason: failure.reason, request: submitted ? 'submitted' : 'not-submitted' }));
      throw failure;
    }
  };
}
