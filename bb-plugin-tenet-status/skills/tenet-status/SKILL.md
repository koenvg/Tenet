---
name: tenet-status
description: Owner instructions for the read-only BB Pi thread TENET status plugin.
disable-model-invocation: true
---

# TENET status

The owner opens **TENET rules** in a Pi thread header. This plugin reads linked archive records on the thread's BB machine. It does not enable TENET, start assessments, grant permission, or write agent messages.

Select **Open thread overview** to browse exact-linked sessions and all call categories beside the conversation. In a narrow panel, switch between **Calls** and **Summary**. Use **Refresh archive** to restart at page one after an unavailable read. Missing records mean unknown, not pass; evaluator failures are not selected FAIL.

For a selected call, open **Why this assessment** and **Browse all rules**. Each page has at most 16 rules. Use **More rules** or **First rule page**; check the page count and missing-snapshot notices.

Rule text over 2,048 characters has an omission marker. Thresholds and probabilities come from the recorded contract, not the current policy. Released permission does not prove execution.
Inspect raw evidence only in the standalone inspector on the selected thread's machine with the same private archive. Follow the [rule limits and raw inspection steps](../../README.md#limits-and-privacy). Another machine's inspector is not a fallback.

Opening the panel starts no inspector listener. When testing this panel offline, follow the [synthetic preview steps](../../README.md#try-the-panel-offline); they install or reload nothing. Native tab focus, remote-host deployment and complete live-history recovery remain unverified by that preview.

For installation and custom archive paths, read [the plugin README](../../README.md). A missing link means coverage is unknown. Use TENET's standalone inspector for historical records without `BB_THREAD_ID`.
