import { JudgeFailure, type Judge, type Json } from './contracts.js';
import { openScopedAssessment } from './assessment-answers.js';
import { APUS_RENDERING_VERSION, APUS_REVISION, renderApus, sortedJson } from './apus-renderer.js';
import { backendIdentity, nativeTokens, scoreCompletion } from './apus-native.js';
import { NativeFailure, nativeTransport } from './apus-transport.js';
import { validLocalBaseUrl } from '../runtime/settings.js';
import { capture, responseSnapshot } from '../recording/contract.js';
import { captureScopedPlan, captureScopedSubmission } from '../recording/scoped-capture.js';
import { APUS_V2 } from '../recording/native.js';

export const APUS_RECORDING_CONTRACT = APUS_V2;

/** Lazy, text-only APUS native choice scoring. No TypeSafe client, runtime download or fallback. */
export function createApusJudge(options: { baseUrl: string; model: string; fetch?: typeof fetch }): Judge {
  const { baseUrl, model, fetch: injectedFetch } = options;
  if (!validLocalBaseUrl(baseUrl) || !model.trim() || model.length > 256 || /[\x00-\x1f\x7f-\x9f]/.test(model)) throw new Error('invalid-apus-settings');
  return async (request, signal, recording) => {
    const transport = nativeTransport(baseUrl, request.deadlineMs, signal, injectedFetch ?? globalThis.fetch);
    let submitted = false;
    const nativeSnapshot = (value: unknown) => ({ nativeContract: APUS_RECORDING_CONTRACT, ...responseSnapshot(value) });
    try {
      transport.check();
      const session = openScopedAssessment(request);
      const { plan, questions } = session;
      captureScopedPlan(recording, request, plan, questions, { provider: 'apus-llamacpp', model, nativeContract: APUS_RECORDING_CONTRACT });
      const metadata = async (phase: 'before' | 'after') => {
        submitted = true;
        const models = await transport.json('/v1/models'), props = await transport.json('/props');
        const identity = backendIdentity(models, props, model);
        transport.check();
        capture(recording, 'response', () => nativeSnapshot({ provider: 'apus-llamacpp', kind: 'metadata', phase, identity }));
        return identity;
      };
      const identity = await metadata('before');
      let previousTokens: number[] = [];
      const tokenize = async (content: string) => nativeTokens(await transport.json('/tokenize', { content, add_special: false, parse_special: true, with_pieces: false }), identity.vocab);
      for (let scope = session.current(); scope; scope = session.current()) {
        transport.check();
        const group = scope.group, selected = scope;
        for (const [key, question] of Object.entries(selected.questions)) {
        transport.check();
        const scopeId = group.id;
        const submission = { submissionId: key, scopeId, questionKeys: [key],
          payloadJson: JSON.stringify({ model, state: group.state, questions: { [key]: question } }),
          ...(selected.confirmation?.confirmationQuestion === key ? { confirmation: selected.confirmation } : {}) };
        const state = sortedJson(group.state as unknown as Json);
        try {
        const criteria = Object.entries(question.criteria).map(([id, description]) => ({ id, description }));
        if (criteria.length === 1) {
          if (scope.factsKey !== key || criteria[0]!.id !== 'NONE') throw new NativeFailure('single-candidate');
          const answer = { type: 'choice', choice: 'NONE', probabilities: { NONE: 1 }, confidence: 1 };
          scope.acceptAnswer(key, identity.model, answer);
          captureScopedSubmission(recording, { submissionId: key, scopeId, questionKeys: [key],
            status: 'unavailable', reason: 'deterministic-NONE-no-native-request' });
          capture(recording, 'response', () => nativeSnapshot({ provider: 'apus-llamacpp', question: key, scopeId, answer,
            derivation: 'sole-allowed-facts-selector', criteria, modelConfidence: false, authenticatedCoverage: false, nativeScoringRequests: 0 }));
          continue;
        }
        captureScopedSubmission(recording, { ...submission, status: 'attempted' });
        const rendered = renderApus({ state, instructions: question.instructions, criteria });
        const tokens = await tokenize(rendered.chat);
        // b11118 generation checks prompt.n_tokens()+1 >= n_ctx. Reserve one
        // output token and one spare slot. Never admit work that can shift context.
        if (tokens.length + 2 > identity.context) throw new NativeFailure('context-overflow');
        const labelIds: Record<string, number> = Object.create(null);
        for (const label of Object.keys(rendered.mapping)) {
          const single = await tokenize(label), appended = await tokenize(rendered.chat + label);
          if (single.length !== 1 || appended.length !== tokens.length + 1 || appended.at(-1) !== single[0]
            || !tokens.every((id, i) => appended[i] === id) || Object.values(labelIds).includes(single[0]!)) throw new NativeFailure('label-boundary');
          labelIds[label] = single[0]!;
        }
        let sharedPrefixTokens = 0;
        while (sharedPrefixTokens < Math.min(previousTokens.length, tokens.length) && previousTokens[sharedPrefixTokens] === tokens[sharedPrefixTokens]) sharedPrefixTokens++;
        // Send complete tokenizer IDs, not separately tokenized prefix/suffix text.
        // This also prevents /completion from adding a second BOS token.
        const nativeRequest = { model, prompt: tokens, stream: false, n_predict: 1, n_probs: 1024,
          temperature: 0, cache_prompt: true, post_sampling_probs: false, return_tokens: true };
        transport.check();
        capture(recording, 'response', () => nativeSnapshot({ provider: 'apus-llamacpp', kind: 'native-request', question: key, scopeId,
          renderingVersion: APUS_RENDERING_VERSION, chat: rendered.chat, mapping: rendered.mapping, labelIds,
          nativeRequest, contextCapacity: identity.context, sharedPrefixTokens, cacheReuseAssumed: false }));
        const raw = await transport.json('/completion', nativeRequest);
        transport.check();
        capture(recording, 'response', () => nativeSnapshot({ provider: 'apus-llamacpp', kind: 'native-response', question: key, scopeId, raw }));
        const answer = scoreCompletion(raw, rendered.mapping, labelIds, tokens.length, identity);
        previousTokens = tokens;
        scope.acceptAnswer(key, identity.model, answer);
        captureScopedSubmission(recording, { ...submission, status: 'completed' });
        } catch (error) {
          captureScopedSubmission(recording, { ...submission, status: 'unavailable',
            reason: error instanceof JudgeFailure ? error.reason : 'provider-error' });
          throw error;
        }
        }
      }
      const finalIdentity = await metadata('after');
      if (JSON.stringify(finalIdentity) !== JSON.stringify(identity)) throw new NativeFailure('backend-changed');
      transport.check();
      const assessment = session.finish(finalIdentity.model);
      transport.check();
      capture(recording, 'validation', () => ({ nativeContract: APUS_RECORDING_CONTRACT, valid: true, assessment, provider: 'apus-llamacpp', renderingVersion: APUS_RENDERING_VERSION }));
      return assessment;
    } catch (error) {
      const failure = error instanceof JudgeFailure ? error : new JudgeFailure(signal.aborted ? 'cancelled' : 'provider-error');
      capture(recording, 'validation', () => ({ nativeContract: APUS_RECORDING_CONTRACT, valid: false, reason: failure.reason,
        ...(error instanceof NativeFailure ? { nativeCategory: error.category } : {}),
        request: submitted ? 'submitted' : 'not-submitted' }));
      throw failure;
    } finally { transport.close(); }
  };
}
