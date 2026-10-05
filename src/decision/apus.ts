import { JudgeFailure, type Judge, type Json } from './contracts.js';
import { assembleAssessment } from './assessment-answers.js';
import { judgeState } from './judge-evidence.js';
import { assessmentEntries, buildQuestions } from './questions.js';
import { APUS_RENDERING_VERSION, APUS_REVISION, renderApus, sortedJson } from './apus-renderer.js';
import { backendIdentity, nativeTokens, scoreCompletion } from './apus-native.js';
import { NativeFailure, nativeTransport } from './apus-transport.js';
import { validLocalBaseUrl } from '../runtime/settings.js';
import { capture, responseSnapshot } from '../recording/contract.js';
import { freeze } from './evidence.js';
import { ASSESSMENT_METADATA } from './assessment-contract.js';
import { UNAVAILABLE_EVIDENCE_CONTEXT } from './evidence-context.js';

/** Additive native capture contract. Semantic questions and archive schema stay unchanged. */
export const APUS_RECORDING_CONTRACT = Object.freeze({
  version: 'apus-recording-v1', renderingVersion: APUS_RENDERING_VERSION,
  rendererRevision: APUS_REVISION, protocolVersion: 'llamacpp-b11118-choice-v1',
});

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
      const entries = assessmentEntries(request.policy), questions = buildQuestions(request.policy, request.resolvedAction) as Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }>;
      const payload = freeze({ model, state: judgeState(request), questions });
      const state = sortedJson(payload.state as Json);
      capture(recording, 'request', () => ({ payload, policy: request.policy, mapping: entries, ...ASSESSMENT_METADATA,
        provider: 'apus-llamacpp', requestedModel: model, nativeContract: APUS_RECORDING_CONTRACT,
        renderingVersion: APUS_RENDERING_VERSION, rendererRevision: APUS_REVISION,
        evidenceContext: request.evidenceContext ?? UNAVAILABLE_EVIDENCE_CONTEXT,
        selectionVersion: (request.evidenceContext ?? UNAVAILABLE_EVIDENCE_CONTEXT).selectionVersion }));
      const metadata = async (phase: 'before' | 'after') => {
        submitted = true;
        const models = await transport.json('/v1/models'), props = await transport.json('/props');
        const identity = backendIdentity(models, props, model);
        transport.check();
        capture(recording, 'response', () => nativeSnapshot({ provider: 'apus-llamacpp', kind: 'metadata', phase, identity }));
        return identity;
      };
      const identity = await metadata('before');
      const answers: Record<string, unknown> = Object.create(null);
      let previousTokens: number[] = [];
      const tokenize = async (content: string) => nativeTokens(await transport.json('/tokenize', { content, add_special: false, parse_special: true, with_pieces: false }), identity.vocab);
      for (const [key, question] of Object.entries(questions)) {
        transport.check();
        const criteria = Object.entries(question.criteria).map(([id, description]) => ({ id, description }));
        if (criteria.length === 1) {
          if (!entries.some(e => e.factsKey === key) || criteria[0]!.id !== 'NONE') throw new NativeFailure('single-candidate');
          const answer = { type: 'choice', choice: 'NONE', probabilities: { NONE: 1 }, confidence: 1 };
          answers[key] = answer;
          capture(recording, 'response', () => nativeSnapshot({ provider: 'apus-llamacpp', question: key, answer,
            derivation: 'sole-allowed-facts-selector', criteria, modelConfidence: false, authenticatedCoverage: false, nativeScoringRequests: 0 }));
          continue;
        }
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
        capture(recording, 'response', () => nativeSnapshot({ provider: 'apus-llamacpp', kind: 'native-request', question: key,
          renderingVersion: APUS_RENDERING_VERSION, chat: rendered.chat, mapping: rendered.mapping, labelIds,
          nativeRequest, contextCapacity: identity.context, sharedPrefixTokens, cacheReuseAssumed: false }));
        const raw = await transport.json('/completion', nativeRequest);
        transport.check();
        capture(recording, 'response', () => nativeSnapshot({ provider: 'apus-llamacpp', kind: 'native-response', question: key, raw }));
        answers[key] = scoreCompletion(raw, rendered.mapping, labelIds, tokens.length, identity);
        previousTokens = tokens;
      }
      const finalIdentity = await metadata('after');
      if (JSON.stringify(finalIdentity) !== JSON.stringify(identity)) throw new NativeFailure('backend-changed');
      transport.check();
      const assessment = assembleAssessment({ model: finalIdentity.model, answers }, request);
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
