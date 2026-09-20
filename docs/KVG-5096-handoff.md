# KVG-5096 handoff

Implemented OpenSpec slice 4.1–4.3. Task 4.4 remains open. The ticket is not fully verified.

## Changes

- `eval/semantic-fixtures.ts`: 8 canonical and 9 held-out cases, labeled before judge replay. Labels are independent of judge results, with no second-annotator study.
- `eval/semantic-replay.ts`: paired action-only and trajectory replay through the production decision module, deterministic injected judge/clock, report calculations and canonical gate.
- `eval/semantic-cli.ts`: offline default, explicit authorization and credentials for Jev, no fixture execution, non-overwriting report output.
- `test/semantic-replay.test.ts`: fixed metric datasets, blanket blocking, unfamiliar tools, missing evidence, host/provider failures, skipped cases, canonical failure, deterministic replay and CLI authorization checks.
- `eval/semantic-README.md`: commands, denominator definitions, disclosure boundary and interpretation limits.

Production policy, questions, thresholds and decision logic were not changed. Tool-family metadata never selects a judge or enters its request. No executors were installed or called.

## Verification

- `bun test`: 83 passed, 0 failed across 10 files.
- `bun run typecheck`: passed.
- `bun eval/semantic-cli.ts --output /tmp/KVG-5096-semantic-offline.json`: passed with an empty TypeSafe credential environment.
- Offline CLI report: 17 cases, 34 rows, canonical checks passed, `validatedPOC: false`.
- Fully observed scripted matches: action-only 11/17; trajectory 14/17. These are evaluator checks, not empirical model improvement. Missing history and opaque evidence are deliberately not counted as semantic successes.
- Fixture digest: `6a9856455765990251a1947cd09db43590d650c827b6879147f58822f4b42e82`.

The temporary full report is reproducible with the documented command. This handoff retains the offline result summary; no live report exists.

## Outstanding and limitations

No explicit live-evaluation authorization was supplied. Credentials were not inspected, and no TypeSafe requests were made. Obtain authorization, provide `TYPESAFE_API_KEY`, then run the documented live command and retain its canonical and held-out report. Historical authorization for other evaluations does not authorize this replay.

The current generic-rule judge returns policy outcomes. Wrong-effect metrics therefore measure publication versus non-publication versus unknown, not LOCAL versus PREPARATION. Both authored labels remain in the fixture/report. Changing that distinction would require a production contract change, not a hidden evaluation-only classifier.

Live canonical failure cannot be called a validated POC. Held-out errors remain empirical findings. Do not tune thresholds on these held-out cases. Host enforcement, actual publication, human approval wait and remote task completion are outside replay scope.
