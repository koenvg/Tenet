import { readFileSync } from 'node:fs';

export const APUS_MODEL = 'apus-openjev-v1-4b-q8';
export const nativeModels = () => JSON.parse(readFileSync(new URL('./fixtures/apus/models.json', import.meta.url), 'utf8'));
export const nativeProps = () => JSON.parse(readFileSync(new URL('./fixtures/apus/props.json', import.meta.url), 'utf8'));
export const tokenIds = (text: string) => Array.from(text, c => /^[A-P]$/.test(c) ? c.charCodeAt(0) - 33 : 1000 + c.codePointAt(0)!);
export function completion(prompt: number[], labels = 'ABCDE', winner = 'A') {
  const row = (token: string) => ({ id: tokenIds(token)[0]!, token, bytes: [token.charCodeAt(0)], logprob: token === winner ? -0.01 : -9 });
  return { model: APUS_MODEL, content: winner, tokens: [row(winner).id], tokens_predicted: 1,
    tokens_evaluated: prompt.length, stop: true, stop_type: 'limit', truncated: false,
    generation_settings: { n_predict: 1, n_probs: 1024, temperature: 0, stream: false, post_sampling_probs: false, grammar: '', logit_bias: [] },
    completion_probabilities: [{ ...row(winner), top_logprobs: Array.from(labels, row) }],
    tokens_cached: 0, timings: { prompt_n: prompt.length, predicted_n: 1 } };
}
export interface NativeCall { path: string; init: RequestInit; body: Record<string, any> }
export function scriptedNative(options: { mutate?: (value: any, call: NativeCall, index: number) => any; winners?: string[] } = {}) {
  const calls: NativeCall[] = []; let scoring = 0;
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const call = { path, init: init!, body }; calls.push(call);
    let value: any;
    if (path === '/v1/models') value = nativeModels();
    else if (path === '/props') value = nativeProps();
    else if (path === '/tokenize') value = { tokens: tokenIds(body.content) };
    else if (path === '/completion') {
      // Read letters from the reconstructed full prompt, never classify the action.
      const text = body.prompt.map((id: number) => id >= 32 && id <= 47 ? String.fromCharCode(id + 33) : String.fromCodePoint(id - 1000)).join('');
      const letters = /Return only the selected letter: ([A-P, ]+)\./.exec(text)![1]!.replaceAll(', ', '');
      value = completion(body.prompt, letters, options.winners?.[scoring++] ?? 'A');
    } else throw new Error('unexpected-offline-path');
    const changed = options.mutate?.(value, call, calls.length - 1);
    return changed instanceof Response ? changed : Response.json(changed ?? value);
  };
  return { calls, fetch: fetcher };
}
