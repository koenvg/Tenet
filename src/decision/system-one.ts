import { JudgeFailure, type Judge, type Json } from './contracts.js';
import { openScopedAssessment } from './assessment-answers.js';
import { capture, responseSnapshot, type RecordingSink } from '../recording/contract.js';
import { freeze, jsonCopy } from './evidence.js';
import { captureScopedPlan, captureScopedSubmission } from '../recording/scoped-capture.js';
import { assessmentBudget } from './assessment-budget.js';
import { createBoundedJsonBody, JSON_BODY_LIMIT } from './bounded-json.js';

import { systemOneOrigin } from './system-one-origin.js';
export type SystemOneAuth = Readonly<{ type: 'none' }> | Readonly<{ type: 'bearer'; token: string | undefined }>;
const REQUEST_LIMIT = 8 * 1024 * 1024;
type Budget = ReturnType<typeof assessmentBudget>;
const validModel = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
  && value.length <= 256 && !/[\x00-\x1f\x7f-\x9f]/.test(value);

function discard(response: Response): void {
  try { void response.body?.cancel().catch(() => {}); } catch {}
}
async function readJson(response: Response, budget: Budget): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    budget.check();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > JSON_BODY_LIMIT)) throw new JudgeFailure('invalid-response');
    if (!response.body) throw new JudgeFailure('invalid-response');
    reader = response.body.getReader();
    const responseBody = createBoundedJsonBody();
    for (;;) {
      const next = await budget.bounded(() => reader!.read().catch(() => {
        budget.check(); throw new JudgeFailure('provider-error');
      }));
      budget.check();
      if (next.done) break;
      if (!responseBody.push(next.value)) throw new JudgeFailure('invalid-response');
    }
    budget.check();
    const decoded = responseBody.decode();
    if (!decoded.ok) throw new JudgeFailure('invalid-response');
    budget.check();
    return decoded.value;
  } finally {
    if (reader) {
      try { void reader.cancel().catch(() => {}); } catch {}
      try { reader.releaseLock(); } catch {}
    } else discard(response);
  }
}
function credentialEcho(value: unknown, token: string): boolean {
  if (typeof value === 'string') return value.includes(token);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => key.includes(token) || credentialEcho(item, token));
}

export function createSystemOneJudge(options: Readonly<{ baseUrl: string; model: string; auth: SystemOneAuth; fetch?: typeof fetch }>): Judge {
  const baseUrl = systemOneOrigin(options.baseUrl), model = options.model, fetcher = options.fetch ?? globalThis.fetch;
  const authType = options.auth.type, token = authType === 'bearer' ? options.auth.token : undefined;
  const loopback = baseUrl !== undefined && ['127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname);
  const unavailable = !baseUrl || !validModel(model) || !['none', 'bearer'].includes(authType) || authType === 'none' && !loopback
    ? 'configuration' : authType === 'bearer' && (typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token)) ? 'missing-credentials' : undefined;
  return async (request, signal, recording) => {
    const budget = assessmentBudget(request.deadlineMs, signal);
    const sink: RecordingSink | undefined = recording && token ? (stage, data) => {
      if (!JSON.stringify(data).includes(JSON.stringify(token).slice(1, -1))) recording(stage, data);
      else recording('response', { untrusted: true, unavailable: true, reason: 'diagnostic-content-withheld', omittedStage: stage });
    } : recording;
    let submitted = false;
    try {
      budget.check();
      if (unavailable) throw new JudgeFailure(unavailable);
      const session = openScopedAssessment(request);
      const { plan, questions } = session;
      captureScopedPlan(sink, request, plan, questions, { provider: 'system-one', model });
      let returnedModel: string | undefined;
      for (let scope = session.current(); scope; scope = session.current()) {
        budget.check();
        const group = scope.group, selected = scope;
        const payload = freeze({ model, state: jsonCopy(group.state) as Record<string, Json>, questions: selected.questions });
        const submission = { submissionId: group.id, scopeId: group.id, questionKeys: Object.keys(selected.questions),
          payloadJson: JSON.stringify(payload), ...(selected.confirmation ? { confirmation: selected.confirmation } : {}) };
        try {
          if (Buffer.byteLength(submission.payloadJson) > REQUEST_LIMIT) throw new JudgeFailure('provider-error');
          captureScopedSubmission(sink, { ...submission, status: 'attempted' });
          budget.check();
          let observed: Response | undefined, reading = false;
          let raw: unknown;
          try {
            const response = await budget.bounded(() => {
              return Promise.resolve().then(() => {
                budget.check();
                submitted = true;
                return fetcher(baseUrl! + '/v1/systemone', {
                  method: 'POST', redirect: 'error', credentials: 'omit', signal: budget.signal,
                  headers: { 'Content-Type': 'application/json', Accept: 'application/json',
                    ...(authType === 'bearer' ? { Authorization: `Bearer ${token}` } : {}) }, body: submission.payloadJson,
                });
              }).then(value => {
                observed = value;
                if (budget.signal.aborted) discard(value);
                return value;
              }, () => { budget.check(); throw new JudgeFailure('provider-error'); });
            });
            budget.check();
            if (!response.ok || response.redirected) throw new JudgeFailure('provider-error');
            reading = true;
            raw = await readJson(response, budget);
          } finally { if (observed && !reading) discard(observed); }
          budget.check();
          capture(sink, 'response', () => ({ scopeId: group.id, ...responseSnapshot(raw, token) }));
          const validated = scope.stage(raw);
          if (!validModel(validated.model) || token && validated.model.includes(token)
            || returnedModel !== undefined && validated.model !== returnedModel) throw new JudgeFailure('invalid-response');
          returnedModel = validated.model;
          validated.commit();
          captureScopedSubmission(sink, { ...submission, status: 'completed' });
        } catch (error) {
          captureScopedSubmission(sink, { ...submission, status: 'unavailable', reason: error instanceof JudgeFailure ? error.reason : 'provider-error' });
          throw error;
        }
      }
      budget.check();
      const assessment = session.finish(returnedModel!);
      if (token && credentialEcho(assessment, token)) throw new JudgeFailure('invalid-response');
      budget.check();
      capture(sink, 'validation', () => ({ valid: true, assessment }));
      budget.check();
      return assessment;
    } catch (error) {
      const failure = error instanceof JudgeFailure ? error : new JudgeFailure(signal.aborted ? 'cancelled' : 'provider-error');
      capture(sink, 'validation', () => ({ valid: false, reason: failure.reason,
        ...(failure.reason === 'invalid-response' ? { validationIssue: failure.validationIssue ?? 'response-shape' } : {}),
        request: submitted ? 'submitted' : 'not-submitted' }));
      throw failure;
    } finally { budget.close(); }
  };
}
