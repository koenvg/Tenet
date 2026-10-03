# Read Pi and Claude recordings together

Use this checkout reference to identify the host, session and execution context of a retained call. The current inspector reads archive schemas 1 through 4 without migrating files. Launch it with [the inspector guide](inspector.md), then select a session and invocation.

## Check the recorded schema and identity

| Archive schema | Identity and recorded meaning |
| --- | --- |
| 1 | Historical Pi data. Directory hash is `sha256(native session ID)`; invocation deep-link hash is `sha256(Tenet invocation ID)`. The reader attributes it to Pi's main context, but adapter capabilities were not recorded. This is not verified historical coverage. |
| 2 | Host/context-qualified session and invocation hashes |
| 3 | Same qualified hashes, plus independent assessment lifecycle: `pending`, `completed`, `unavailable`, `dropped`, `cancelled` |
| 4 | Current Pi/Claude writes, adding versioned owner-only runtime evidence diagnostics. Earlier payloads, thresholds and identities stay unchanged. |

For schemas 2 through 4, a session directory hashes `[host, native session ID, execution context ID]`. An invocation link hashes those values plus the Tenet invocation ID. A native ID reused across hosts or child contexts therefore gets separate pages.

Schema 3 was the production format before schema 4. It remains readable alongside schemas 1 and 2. Missing historical diagnostics are **Not recorded**, not complete coverage. See [schema-4 provenance and validation](inspection-evidence.md#recorded-and-inspector-explanations).

The inspector shows capabilities recorded at invocation time, not today's installed configuration. Stock Pi and Claude have unsupported authenticated action resolution. The Claude prototype has no verified pinned host or stock trusted live owner approval UI. Attribution does not establish either kind of coverage.

## Read assessment, permission and execution separately

```text
same captured invocation
    +--> assessment lifecycle --> finding / would-decision
    +--> actual permission ----> released or withheld
    +--> execution record ------> executed, failed or unknown
```

In observe, permission precedes assessment. Result-before-assessment and assessment-before-result are both valid. A later finding uses the original pre-execution snapshot, not post-execution state. Pending or dropped assessment has no would-decision.

Historical records keep their recorded `executed` or `failed` outcome. Current hosts need supported exact result correlation to report those outcomes for an invocation.

New SDK-backed Pi records keep execution `unknown`, even when a native result reports success or failure. Pi does not declare `result-correlation`, so a captured result is not exact execution evidence for that invocation. Without a result, execution also stays unknown.

Released permission is not execution. A result does not independently verify remote effects. A crash or writer failure can leave an incomplete archive, never a pass.

Older decisions use recorded contributions or configuration captured with that invocation, not current thresholds. The reader does not recompute decisions or reinterpret historical enforcement as observation.

## Check missing records and lost coverage

Recording is best-effort. `TENET_RECORDING=off` stops persistence, not observation or owner status. Dormant sessions and shared off suppress diagnostic capture. Recording errors do not change permission.

Observe allows at most two running and 32 waiting jobs, 1 MiB of retained snapshots and five seconds of queue age. Capacity/expiry drops permit the tool but report lost coverage. Queue wait and provider deadline are separate.

Off, replacement and shutdown cancel remaining work without waiting for stalled providers. Pending writes can drain after off. Shutdown's archive drain is bounded; old files are never erased. Stage snapshots retain redaction and byte limits. See [storage, retention and deletion](inspector.md#sensitive-local-storage) and [observation queue limits](limits.md#background-observation-can-lose-coverage).

The inspector has no approval or control endpoint. Removing Claude hooks or stopping its bridge stops Claude interception, not historical storage. Tenet is not a sandbox, and one host's installation or enforce mode does not establish another host's coverage.

## Unsupported or corrupt records appear

Unknown versions, corrupt files and unsafe paths appear under Recording issues, not as guessed Pi records. The partial-coverage warning means only the supported subset is visible.

For a checkout upgrade, rebuild inspector assets and restart the running inspector or the Pi process that launched it. Rebuilding alone does not update reader code in an old process. Archive owners replace the verified installation and restart without a local build. Keep an upgraded inspector for newer records: older readers cannot inspect schema 3 or 4 merely because the checkout now has a newer reader. Never rewrite archives for rollback.
