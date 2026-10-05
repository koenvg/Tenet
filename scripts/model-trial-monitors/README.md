# Check model-trial monitor delivery

Use these developer-checkout scripts to maintain the one-off APUS and Clef monitors on Pika. They are not part of the Tenet installation archive.

## Build and test offline

You need Python 3. This supported checkout procedure makes no SSH, BB, model, or TypeSafe calls.

1. Edit [the shared lifecycle](lifecycle.py) for durable saves, delivery, retries, failure thresholds, recovery, and terminal pause. Edit [the APUS rules](apus.py) or [the Clef rules](clef.py) for probes, messages, and terminal conditions.
2. From the repository root, generate the standalone copies:

   ```sh
   python3 -B scripts/model-trial-monitors/generate.py
   ```

3. Check that the generated files match their sources, then run the offline tests:

   ```sh
   python3 -B scripts/model-trial-monitors/generate.py --check
   python3 -B scripts/model-trial-monitors/test_watch.py
   ```

Generation prints `Generated standalone monitor scripts`. The check prints `Monitor scripts are current`, and tests report `OK`. If the check reports stale scripts, regenerate them. Do not edit `apus_watch.py` or `clef_watch.py` directly.

The maintained files combine as follows:

```text
lifecycle.py + apus.py -> apus_watch.py
lifecycle.py + clef.py -> clef_watch.py
```

Each generated script includes the lifecycle code and uses only the Python standard library. It needs no local imports when stored alone.

The tests use temporary state files and a local SQLite queue to simulate accepted delivery, crashes, rejection, timeouts, recovery, and terminal pause. They also run copied scripts in isolated Python processes with fake commands. The suite checks generation drift in application CI. BB queue API and CLI tests live in the separate BB checkout.

## Delivery contract

Each monitor saves a terminal event before delivery. The event contains the exact notice and the key `model-trial:<automation-id>:terminal`. A retry sends the saved event without reading Pika again. The monitor records `terminal_notified` only after BB accepts the request, then pauses its automation. If pausing fails, the next tick retries the pause without sending another notice.

BB must support `thread queue create --idempotency-key`. The keyed queue endpoint commits the acceptance receipt and queue row together. It retains the receipt after dispatch. An old CLI or server rejects the keyed request; there is no unkeyed fallback. Leave the event pending and install a reviewed BB build before retrying. Do not remove pending state to bypass the error.

These are one-off trials. A new trial needs a new automation ID. Reusing an ID and deleting its state can conflict with the saved receipt. Existing `terminal_notified` state remains final and causes only a pause.

After three consecutive failed status checks, each monitor saves a connection event with the exact alert and a unique key `model-trial:<automation-id>:connection:<uuid>`. It retries the saved event before another status check and records `connection_alerted` only after BB accepts the request.

A successful status check clears that event and resets the failure count. A later interruption gets a new key and can produce a new alert.

Queue acceptance does not prove provider execution or a user-visible answer. BB owns later queue dispatch.

## Update a stored monitor

Editing or generating these files does not update an automation. BB runs its stored copy of `apus_watch.py` or `clef_watch.py`. Keep the automation paused until the new queue support is installed and checked.

A live monitor reads status and logs from Pika over SSH and sends them to a BB thread. Get separate approval before running or resuming it. Installing or restarting BB also needs separate approval. Updating a paused stored script does not grant approval to run it.
