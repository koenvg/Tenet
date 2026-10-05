# Archive third-party notices

Use this reference to check bundled licenses in the production archive. It ships as `THIRD_PARTY_NOTICES.md` at the archive root; local paths below are relative to that delivered root. For checkout attribution, use the optional [repository notices](https://github.com/koenvg/Tenet/blob/main/THIRD_PARTY_NOTICES.md).

Tenet is MIT licensed. See `LICENSE`.

The built inspector includes:

- Kode Mono, copyright 2023 The Kode Mono Project Authors. See `inspector/OFL-Kode-Mono.txt` for the SIL Open Font License 1.1.
- Svelte runtime, copyright Svelte contributors. See `inspector/LICENSE-Svelte.md` for its MIT license.

The compiled APUS OpenJev renderer port retains Apache License 2.0 terms, APUS AI-LAB authors gumpcheng and zhangxu, and the upstream Copyright 2026 Alibaba Cloud notice. See [the unchanged license](third-party/apus/LICENSE) and [the port attribution and changes](third-party/apus/NOTICE). The pinned source revision is `7389d774472c9e29ddc84fffb392951f0f25de74`. Tenet's MIT license does not relicense that work.

No model weights, llama.cpp runtime, upstream Python or independent development oracle are bundled. Backend aliases are not proof of loaded weights. See the delivered [private judge setup guide](docs/judge.md) for separately authorized owner operation and disclosure limits.

Runtime dependencies installed with npm retain their own licenses in `node_modules`. This archive does not contain a dependency tree or the repository's development tools, site fonts, or development skills.
