import { NativeFailure } from './apus-transport.js';

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const tokenId = (v: unknown, vocab: number): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) < vocab;
const logProbability = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v <= 0;

/** Pinned b11118 metadata. Alias is an honest backend claim, not weight attestation. */
export function backendIdentity(models: unknown, props: unknown, expected: string) {
  if (!object(models) || models.object !== 'list' || !Array.isArray(models.data) || models.data.length !== 1
    || !object(models.data[0]) || models.data[0].id !== expected || !object(models.data[0].meta)
    || !object(props) || props.model_alias !== expected || !object(props.default_generation_settings)) throw new NativeFailure('model-identity');
  const meta = models.data[0].meta, context = props.default_generation_settings.n_ctx;
  if (!positive(context) || !positive(meta.n_ctx) || meta.n_ctx !== context || !positive(meta.n_vocab) || !positive(meta.n_ctx_train) || context > meta.n_ctx_train
    || typeof props.model_path !== 'string' || !props.model_path.trim() || typeof props.build_info !== 'string' || !props.build_info.trim()
    || props.is_sleeping !== false) throw new NativeFailure('backend-metadata');
  return { model: models.data[0].id as string, context, vocab: meta.n_vocab as number,
    modelPath: props.model_path as string, build: props.build_info as string };
}
export function nativeTokens(value: unknown, vocab: number): number[] {
  if (!object(value) || !Array.isArray(value.tokens) || !value.tokens.length
    || !value.tokens.every((id: unknown) => tokenId(id, vocab))) throw new NativeFailure('tokenizer-shape');
  return value.tokens;
}
export function scoreCompletion(value: unknown, mapping: Record<string, string>, labelIds: Record<string, number>, promptTokens: number, identity: ReturnType<typeof backendIdentity>) {
  if (!object(value) || value.truncated !== false || value.stop !== true || value.tokens_predicted !== 1
    || value.tokens_evaluated !== promptTokens || !Array.isArray(value.completion_probabilities) || value.completion_probabilities.length !== 1
    || !Array.isArray(value.tokens) || value.tokens.length !== 1 || !tokenId(value.tokens[0], identity.vocab)) throw new NativeFailure('completion-shape');
  if (('model' in value && value.model !== identity.model)
    || (object(value.generation_settings) && 'model' in value.generation_settings && value.generation_settings.model !== identity.model)) throw new NativeFailure('model-identity');
  if (object(value.generation_settings)) {
    const s = value.generation_settings;
    for (const [key, expected] of Object.entries({ n_predict: 1, n_probs: 1024, temperature: 0, stream: false, post_sampling_probs: false }))
      if (key in s && s[key] !== expected) throw new NativeFailure('scoring-settings');
    if ('n_ctx' in s && s.n_ctx !== identity.context) throw new NativeFailure('context-identity');
    if ((s.grammar !== undefined && s.grammar !== '') || (s.logit_bias !== undefined && (!Array.isArray(s.logit_bias) || s.logit_bias.length))) throw new NativeFailure('scoring-settings');
  }
  const position = value.completion_probabilities[0];
  if (!object(position) || !tokenId(position.id, identity.vocab) || position.id !== value.tokens[0]
    || typeof position.token !== 'string' || !logProbability(position.logprob)
    || !Array.isArray(position.top_logprobs) || !position.top_logprobs.length || position.top_logprobs.length > 1024) throw new NativeFailure('scored-position');
  const scores = new Map<string, number>(), seenIds = new Set<number>();
  for (const row of position.top_logprobs) {
    if (!object(row) || !tokenId(row.id, identity.vocab) || seenIds.has(row.id) || typeof row.token !== 'string'
      || !logProbability(row.logprob)) throw new NativeFailure('candidate-data');
    seenIds.add(row.id);
    const labelForId = Object.keys(labelIds).find(label => labelIds[label] === row.id);
    if (labelForId && row.token !== labelForId) throw new NativeFailure('candidate-token');
    if (Object.hasOwn(mapping, row.token)) {
      if (scores.has(row.token) || row.id !== labelIds[row.token] || !Array.isArray(row.bytes)
        || row.bytes.length !== 1 || row.bytes[0] !== row.token.charCodeAt(0)) throw new NativeFailure('candidate-token');
      scores.set(row.token, row.logprob);
    }
  }
  const labels = Object.keys(mapping);
  if (!labels.every(label => scores.has(label))) throw new NativeFailure('candidate-missing');
  const peak = Math.max(...labels.map(label => scores.get(label)!));
  const weights = labels.map(label => Math.exp(scores.get(label)! - peak));
  const total = weights.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(labels.map((label, i) => [mapping[label]!, weights[i]! / total]));
  let best = 0;
  for (let i = 1; i < weights.length; i++) if (weights[i]! > weights[best]!) best = i;
  return { type: 'choice', choice: mapping[labels[best]!]!, probabilities, confidence: weights[best]! / total };
}
