import assert from 'node:assert/strict';

// Synthetic b11118 protocol, not a tokenizer, model, trial or accuracy oracle.
// This development fixture is copied only into the disposable consumer, never delivery.
export const alias = 'apus-openjev-v1-4b-q8';
export const baseUrl = 'http://127.0.0.1:8088';
const ids = text => Array.from(text, c => /^[A-P]$/.test(c) ? c.charCodeAt(0) - 33 : 1000 + c.codePointAt(0));
export function scriptedNative({ ruleCount = 1, outcome = () => 'PASS', beforeCompletion = async () => {}, fail = () => false } = {}) {
  assert.ok(Number.isInteger(ruleCount) && ruleCount >= 1 && ruleCount <= 16);
  const calls = []; let scoring = 0;
  const fetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(target.origin, baseUrl, 'selected APUS must not fallback or contact any real service');
    assert.equal(init.redirect, 'error');
    assert.ok(!new Headers(init.headers).has('authorization'), 'no TypeSafe credentials forwarded');
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ path: target.pathname, body });
    if (fail()) return new Response('private-offline-error-canary', { status: 503 });
    let value;
    if (target.pathname === '/v1/models') value = { object: 'list', data: [{ id: alias, meta: { n_ctx: 32768, n_ctx_train: 32768, n_vocab: 300000 } }] };
    else if (target.pathname === '/props') value = { model_alias: alias, model_path: '/offline/weights-not-present.gguf',
      build_info: 'b11118-e6ab7c1a4', is_sleeping: false, total_slots: 1, default_generation_settings: { n_ctx: 32768 } };
    else if (target.pathname === '/tokenize') {
      assert.equal(body.add_special, false); assert.equal(body.parse_special, true);
      value = { tokens: ids(body.content) };
    } else if (target.pathname === '/completion') {
      const question = scoring++ % ((ruleCount + 1) * 2);
      await beforeCompletion(question);
      assert.equal(body.n_predict, 1); assert.equal(body.n_probs, 1024);
      assert.equal(body.temperature, 0); assert.equal(body.post_sampling_probs, false);
      const prompt = body.prompt.map(id => id >= 32 && id <= 47 ? String.fromCharCode(id + 33) : String.fromCodePoint(id - 1000)).join('');
      const labels = /Return only the selected letter: ([A-P, ]+)\./.exec(prompt)[1].replaceAll(', ', '');
      const winner = question < ruleCount * 2 && question % 2 === 0 ? { PASS: 'A', APPROVAL_REQUIRED: 'B', FAIL: 'C', UNKNOWN: 'D' }[outcome()] : 'A';
      assert.ok(winner && labels.includes(winner));
      const row = token => ({ id: ids(token)[0], token, bytes: [token.charCodeAt(0)], logprob: token === winner ? -0.01 : -9 });
      value = { model: alias, content: winner, tokens: [row(winner).id], tokens_predicted: 1, tokens_evaluated: body.prompt.length,
        stop: true, stop_type: 'limit', truncated: false,
        generation_settings: { n_predict: 1, n_probs: 1024, temperature: 0, stream: false, post_sampling_probs: false, grammar: '', logit_bias: [] },
        completion_probabilities: [{ ...row(winner), top_logprobs: Array.from(labels, row) }], tokens_cached: 0,
        timings: { prompt_n: body.prompt.length, predicted_n: 1 } };
    } else throw new Error('unexpected-scripted-path');
    return Response.json(value);
  };
  return { fetch, calls };
}
