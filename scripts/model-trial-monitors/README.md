# Check model-trial monitor delivery

Use these developer-checkout scripts to maintain the one-off APUS and Clef monitors on Pika. They are not part of the Tenet installation archive.

## Run the offline tests

You need Python 3. From the repository root, run:

```sh
python3 -B scripts/model-trial-monitors/test_watch.py
```

Success reports `OK`. The tests use temporary state files and a local SQLite queue to simulate accepted delivery, rejection, and timeouts. They make no SSH, BB, model, or TypeSafe calls. BB queue API and CLI tests live in the separate BB checkout.

## Delivery contract

Each monitor saves a terminal event before delivery. The event contains the exact notice and the key `model-trial:<automation-id>:terminal`. A retry sends the saved event without reading Pika again. The monitor records `terminal_notified` only after BB accepts the request, then pauses its automation. If pausing fails, the next tick retries the pause without sending another notice.

BB must support `thread queue create --idempotency-key`. The keyed queue endpoint commits the acceptance receipt and queue row together. It retains the receipt after dispatch. An old CLI or server rejects the keyed request; there is no unkeyed fallback. Leave the event pending and install a reviewed BB build before retrying. Do not remove pending state to bypass the error.

These are one-off trials. A new trial needs a new automation ID. Reusing an ID and deleting its state can conflict with the saved receipt. Existing `terminal_notified` state remains final and causes only a pause.

Queue acceptance does not prove provider execution or a user-visible answer. BB owns later queue dispatch. Connection-interruption alerts still use best-effort delivery.

## Update a stored monitor

Editing these source files does not update an automation. BB runs its stored copy. Keep the automation paused until the new queue support is installed and checked.

A live monitor reads status and logs from Pika over SSH and sends them to a BB thread. Get separate approval before running or resuming it. Installing or restarting BB also needs separate approval. Updating a paused stored script does not grant approval to run it.
