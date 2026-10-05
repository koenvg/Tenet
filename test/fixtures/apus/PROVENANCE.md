# Check the pinned APUS fixtures

Use this checkout-only reference to check renderer and native-protocol fixtures. The tests run offline with scripted transport. They do not call a model, execute fixture actions or prove accuracy.

## Run the byte check

Complete [development setup](../../../CONTRIBUTING.md#set-up). From the repository root, use a canonical temporary home and no provider credentials:

```sh
set -e
testhome=$(mktemp -d /tmp/tenet-apus-fixtures.XXXXXX)
testhome=$(cd "$testhome" && pwd -P)
trap 'rm -rf "$testhome"' EXIT
env -u TYPESAFE_API_KEY HOME="$testhome" TMPDIR=/tmp bun test --isolate --max-concurrency=1 test/apus-renderer.test.ts
```

Both tests must pass. A mismatch means the port or fixture changed. Compare with the pinned source below before changing expected bytes. Do not replace the golden outputs with output from the TypeScript port.

## Renderer oracle

`rendering.json` contains independent expected bytes. A development-only Python 3 standard-library oracle imported the unchanged pinned `openjev_contracts.py`, called `render_prompt_parts`, `render_prompt` and `label_mapping`, and formatted the `CHAT` constant read with `ast.literal_eval` from `examples/openjev_local.py`. It did not import or call that example's network client. No trial code, model, tokenizer or TypeScript implementation generated the expected output.

The input request and optional `stateInput` are in each row. For that state input, Python used `json.dumps(stateInput, ensure_ascii=False, sort_keys=True)` before rendering. The oracle used the input order for criteria, not sorted criterion IDs.

The rows cover composed and decomposed Unicode, Chinese, emoji, astral/BMP key order, numeric-looking object keys, nested state, escaped quotes, backslashes, tabs, newlines, U+2028/U+2029, two candidates and all sixteen A-through-P candidates. Prefix, suffix, combined prompt, chat wrapper and label mapping are stored separately. The wrapper has no system message and closes an empty thinking block before the answer.

Pinned public source is [APUS GGUF revision 7389d774472c9e29ddc84fffb392951f0f25de74](https://huggingface.co/apus-ailab/APUS-OpenJev-v1-4B-GGUF/tree/7389d774472c9e29ddc84fffb392951f0f25de74). The prompt version is `jev.dynamic.prompt.v2`.

| File | SHA-256 |
| --- | --- |
| `openjev_contracts.py` | `d8e8e5270ecd6dab917d886dda2d684c24696b811faa968bb3c399ceef5e356a` |
| `examples/openjev_local.py` | `b3ff3c081653c8aed429dd21bedd83ddcb17f11625755d29359c8c1b384aa279` |
| `LICENSE` | `bbedc3fda3305820b977265f01b8619d87570a6739de3a5582c3464840f1e57a` |
| `rendering.json` | `b2bc42ffb8eac16976519d9cf7f298794db29cbb139987e7cb5e79fb8b456a9e` |

The original source, oracle script and output hash are in the TENET-69 task artifacts. The normal Bun suite reads the JSON only. Product use requires no Python, upstream source execution or runtime downloads. [Attribution and license](../../../third-party/apus/NOTICE) apply to the port.

## Native protocol fixtures

`models.json` and `props.json` are synthetic protocol examples, not captured server replies or weight evidence. Their shapes follow [llama.cpp b11118 server-context.cpp](https://github.com/ggml-org/llama.cpp/blob/e6ab7c1a41054a888ada952eab4c886444c2f5ad/tools/server/server-context.cpp), functions `get_res_model_info`, `get_res_models` and `get_res_props`. The source includes `meta.n_ctx` and `model_alias`, which the older README examples omit.

The fake alias, path, counts and capacity are explicit test data. The fake tokenizer in `test/apus-scripted.ts` maps characters to test IDs; it is not an APUS tokenizer. Production verifies label IDs and complete-prompt boundaries with the backend tokenizer.

Completion fixtures follow `server-task.cpp`, functions `completion_token_output::probs_vector_to_json` and `server_task_result_cmpl_final::to_json_non_oaicompat`. Native `completion_probabilities`, not the README's illustrative `probs` key, contains one position with `top_logprobs`, token ID/text/bytes and log probability. `server-common.cpp::tokenize_mixed` permits complete token-ID prompts without adding BOS.

The inspected commit is `e6ab7c1a41054a888ada952eab4c886444c2f5ad`. Source SHA-256 values are:

| File | SHA-256 |
| --- | --- |
| `tools/server/README.md` | `b45beb0842fcc98709b7df26d22da93db5f73f88386f0a6a9d6c18eac522b024` |
| `tools/server/server-context.cpp` | `2f5d65ce6ef0504b5c8cf55a74c68d3959c49784ba380ef836566b7a7d5fa12b` |
| `tools/server/server-common.cpp` | `de3a89422f67b97eb385041fae17e553dc677aac6b67f2e98e9f0beff672b4e0` |
| `tools/server/server-task.cpp` | `0fd5c8df2525e61214986e8abe3fc4edbb92f5dd652c9c2bfd1bc2712218a585` |

The adapter checks prompt length plus one output token and one spare slot before scoring, and rejects truncation. b11118 does not expose a per-request context-shift switch. No invented switch or separately tokenized shared prefix is used. Cache counters do not prove reuse, authenticated coverage or execution. See the [maintained native contract](../../../docs/judge.md#pinned-native-assessment-contract) for transport limits and failure behavior.
