# TENET-17 handoff

The install-to-findings owner path is implemented. No owner installation, live evaluator request, registry publication or public release was performed.

## Owner path and delivery

The README now starts with one-time production installation, then per-project secure credential configuration, provider disclosure and capture opt-out, owner-written `Rule; BLOCK;` policy, direct offline diagnosis, full restart into observation and native status/findings. The detailed archive guide and operation reference cover dormancy, invalid policy, credentials, pending/lost findings, unverified coverage, process-level enforcement opt-in, distinct on/off and capture controls, inspector use, removal and rollback.

Build and verify from a development checkout:

```sh
bun run package:archive
bun run package:verify delivery/tenet.tar.gz
```

The archive now includes `dist/cli/index.js`, the compiled doctor modules and declarations, and `docs/doctor.md`. Invoke it directly after installing production dependencies:

```sh
node "$TENET_DIR/dist/cli/index.js" doctor --project /absolute/path/to/project
node "$TENET_DIR/dist/cli/index.js" doctor --project /absolute/path/to/project --json
```

Doctor uses the manifest's declared Pi entry to check the checkout or compiled archive layout. It remains read-only and reports local readiness without verifying provider connectivity, credentials or active hooks. The closed delivery list also now includes the existing required `decision/history-selection` module, whose omission prevented packaging this baseline. No history-selection logic changed. Packaged references have working local links checked by the content contract.

Pi owns only a registration of the stable extracted path; keep the installation and its dependencies there. Installation or replacement requires a new process. Removal uses `pi remove "$TENET_DIR"` followed by restart. Historical evidence and control remain separately owner-managed. Replace a whole installation rather than overlaying archives; review older policy/mode behavior before rollback. Reverting to a pre-SDK archive removes the alpha entry. Recorded historical contracts are not rewritten.

## Offline acceptance evidence

`scripts/verify-delivery.ts` extracts outside the checkout, installs locked production dependencies, registers Pi against an isolated home/settings directory, writes an owner policy externally, and invokes the delivered doctor under Node and Bun. Fresh processes discover the registered resource and exercise native owner commands through the actual production extension.

`scripts/fixtures/archive-owner.mjs` scripts only assistant output and judge transport. It writes only a disposable `owner-demo.txt`. Observe releases the local write while judgment is held pending, then shows completed owner-only FAIL/BLOCK findings with no native confirmation. Off stops new assessments; on restores observe. A fresh explicit enforce process dispatches only PASS and approved ASK, withholding denied ASK and FAIL. Native results remain unknown in SDK records despite independently counted local executor calls. Fresh capture-opt-out observation retains native findings without adding archive sessions. Removal leaves recorded sessions and owner policy intact.

Existing delivery checks retain isolated Node/Bun SDK imports, TypeScript declarations, inspector HTTP over historical scripted records, pinned Pi dispatch, and registration/removal discovery. No fixtures, policy, credentials, recordings or developer dependency trees ship in the archive.

## Validation

Tested with Node 24.15.0, Bun 1.3.14 and Pi 0.85.1. Supported minimums remain Node 22.19 for Pi/archive use and Node 22.12 for SDK-only use; the local run did not repeat the Node minimum-version matrix.

Passed:

- `bun run sdk:build` and `bun run inspector:build`
- Focused doctor/delivery tests, 40 passed
- `TMPDIR=/tmp bun test --isolate --max-concurrency=1 --timeout=30000`, 604 passed, 0 failed across 67 files, including SDK, doctor, Pi smoke, shared-runtime, Claude offline, recording and historical inspector checks
- `bun run typecheck`
- `bun run inspector:check`, 0 errors and 0 warnings
- `CI=1 bun run inspector:test`, 16 component and 24 browser tests passed
- `bun run sdk:example` and `bun run smoke`, 4 smoke tests passed
- `bun run package:archive` and `bun run package:verify delivery/tenet.tar.gz`, including registered observe/enforce and capture-opt-out owner flows under Node/Bun
- `openspec validate coding-agent-first-sdk --strict`
- `git diff --check`

Initial full-suite setup lacked the BB plugin's separate test dependencies and used a sandbox temp path exceeding the Claude prototype's socket bound. Installing those dependencies and using `TMPDIR=/tmp` resolved those failures. One doctor subprocess run timed out during a slow full-suite run; focused and full reruns passed without changing its deadlines. An inspector before-each call-list poll also timed out once; the complete inspector rerun passed without source changes. These transient failures are not hidden as first-run passes.

Packaging installs dependencies through npm registry access or its cache. All assessment, doctor, Pi and inspector exercises are offline. CI itself was not run here.

## Scope and remaining limits

The pre-implementation baseline is `2320f3295c3682b5303f5e6d8c9c84685f85ea73`. Changes are packaging/verification, doctor installation inspection, owner documentation and focused tests. No prompt, assessment profile, threshold, policy grammar, archive schema or external owner policy changed. Other in-flight OpenSpec artifacts remain untouched.

Pi does not guarantee post-hook argument stability, exact native result correlation or stock authenticated action resolution. Tenet is not an OS sandbox or subprocess monitor. Same-user processes can change control and read evidence. Pending/lost assessment is not a pass, and default capture can contain secrets. Recording opt-out does not prevent provider disclosure. Claude remains an unverified prototype; scripted results prove mechanics, not live semantic accuracy.

## Completion review

The single fresh-context read-only review approved the complete task diff against the baseline, including both untracked files, with no actionable correctness, safety or maintainability findings. It independently reran the 40 focused doctor/delivery tests and baseline whitespace checks, and inspected the actual delivery contents. The broader validation above was supplied evidence, not repeated by the reviewer. Normal CI and human review remain required. The owner subsequently requested a pull request for these changes.
