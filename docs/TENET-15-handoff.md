# TENET-15 handoff

## Result

The offline doctor checks a selected project without starting Pi or a guard session. It emits human text or schema-versioned JSON and never makes an assessment. Runtime enforcement code and configuration semantics are unchanged.

Baseline: `2c5d4b7c15ead7f0ef887dc36785160e175e9bc6`.

- `src/cli/index.ts` compiles to `dist/cli/index.js` as part of `bun run sdk:build`.
- `src/doctor/doctor.ts` reuses policy validation, mode/configuration, cooperative control reads and recording configuration. It returns ready, off, dormant, invalid or unavailable with separate issues and limitations.
- `src/doctor/installation.ts` inspects current delivery entry files and bounded package metadata without executing the host or importing runtime dependencies. Pi 0.85.1 is the tested pin. Unknown host metadata stays unknown; detected untested versions fail diagnosis.
- `docs/doctor.md` documents direct Node/Bun invocation before global installation, exit precedence, privacy, capture and compatibility limits. README links it.
- `test/doctor.test.ts` covers policy selection, validation, credentials, configuration, bypass states, delivery and host metadata. Relocated compiled Node/Bun subprocesses use network, write, process, watcher and interval traps with isolated project/home directories and before/after snapshots across eleven setup cases, including empty PATH components, build metadata and semver-shaped credential canaries. Text and JSON reject canary credentials and policy text.

## Validation

Local runtimes: Node 24.14.0 and Bun 1.3.14. Tests use no live provider or model.

- SDK/CLI build and executable SDK guide: pass.
- Inspector build: pass.
- Full isolated Bun suite with `TMPDIR=/private/tmp`: 574 passed, zero failures across 65 files.
- Repository/guide typecheck: pass.
- Inspector check: zero errors and warnings.
- Inspector tests: 16 component and 24 browser tests passed.
- `git diff --check`: clean.

The short physical TMPDIR avoids the existing Claude prototype's Unix socket path limit. Dependencies were installed with the frozen lockfile, including the nested BB plugin's separate dependency install. No package/lock changes were needed.

## Completion review

The single fresh-context reviewer returned request changes for three compatibility-boundary findings. The parent reproduced all three with failing regressions, fixed them and reran the complete validation above. No second reviewer was launched. The recorded verdict remains request changes; these resolutions are implementation evidence, not independent reapproval.

- Credential-safe output now covers externally derived detected versions and policy digests as well as paths. Tests cover a semver-shaped credential, a credential substring in a prerelease suffix, and a key matching the policy digest. Compatibility classification uses the original metadata before output redaction.
- PATH discovery skips non-executable candidates using read-only execute-permission checks. Competing real-permission fixtures verify the first executable host, and relocated compiled Node/Bun cases cover empty components meaning the command's current directory. No launcher is executed.
- Bounded version validation recognizes valid SemVer prerelease/build metadata and rejects malformed numeric identifiers. Untested versions, including build metadata on the tested core version, remain unavailable because the tested pin comparison is exact.

Final focused doctor coverage is 18 tests, included in the 574-test repository run. The compiled subprocess matrix runs both output formats under Node and Bun across eleven setup cases with traps and unchanged snapshots. Human review remains before task acceptance.

## Remaining boundary

Production archive integration and global binary registration remain with the final owner-experience task. This command checks the current local-install entry layout, not a future archive contract or every transitive dependency. It does not certify archive integrity, extension registration, active hooks, credential validity, provider connectivity or future capture writability. Off and dormant are bypass states, not assessed permissions. Unknown compatibility is a visible limitation rather than a fabricated tested result.
