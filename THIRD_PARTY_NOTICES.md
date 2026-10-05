# Third-party notices

TENET's MIT license does not relicense the following bundled work:

- Kode Mono font in `inspector/src/fonts/kode-mono-latin.ttf`: copyright 2023 The Kode Mono Project Authors, SIL Open Font License 1.1. The notice and license are in [`inspector/src/fonts/OFL-Kode-Mono.txt`](inspector/src/fonts/OFL-Kode-Mono.txt). The CI install archive includes a copy beside the built inspector.
- Geist font in `site/fonts/Geist-latin.woff2`: copyright 2024 The Geist Project Authors, SIL Open Font License 1.1. The notice and license are in [`site/fonts/OFL-Geist.txt`](site/fonts/OFL-Geist.txt).
- Impeccable skill and executable in `.pi/skills/impeccable/`: [pbakaus/impeccable](https://github.com/pbakaus/impeccable), Apache License 2.0. The upstream license is copied to [`.pi/skills/impeccable/LICENSE`](.pi/skills/impeccable/LICENSE). Impeccable is a repository development tool, not part of the install archive.
- APUS renderer port in `src/decision/apus-renderer.ts`: APUS AI-LAB, gumpcheng and zhangxu, Apache License 2.0. The port uses GGUF revision `7389d774472c9e29ddc84fffb392951f0f25de74`. License and attribution are in [`third-party/apus/LICENSE`](third-party/apus/LICENSE) and [`third-party/apus/NOTICE`](third-party/apus/NOTICE). The production archive includes the compiled port and both attribution files, but no weights, inference runtime or upstream Python.

Other installed dependencies keep their own license terms. The CI install archive does not bundle `node_modules`.
