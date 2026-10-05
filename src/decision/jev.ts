import { TypeSafeClient, APITimeoutError, APIUserAbortError, type Fetch } from '@typesafe-ai/sdk';
import { JudgeFailure, type Judge } from './contracts.js';
import { MODEL } from './typesafe-contract.js';
import { assembleAssessment } from './assessment-answers.js';
import { judgeState } from './judge-evidence.js';
import { assessmentEntries, buildQuestions } from './questions.js';
import { capture, responseSnapshot } from '../recording/contract.js';
import { freeze } from './evidence.js';
import { ASSESSMENT_METADATA } from './assessment-contract.js';
import { UNAVAILABLE_EVIDENCE_CONTEXT } from './evidence-context.js';

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
      const questions = buildQuestions(request.policy, request.resolvedAction);
      const payload = freeze({ model: MODEL, state: judgeState(request), questions });
      submitted = true;
      capture(recording, 'request', () => ({ payload, policy: request.policy, mapping: entries, ...ASSESSMENT_METADATA, evidenceContext: request.evidenceContext ?? UNAVAILABLE_EVIDENCE_CONTEXT, selectionVersion: (request.evidenceContext ?? UNAVAILABLE_EVIDENCE_CONTEXT).selectionVersion }));
      const raw = await client.systemOne(payload, { signal, timeout: request.deadlineMs, retry: { maxRetries: 0 } });
      capture(recording, 'response', () => responseSnapshot(raw));
      const assessment = assembleAssessment(raw, request);
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
    }
  };
}
