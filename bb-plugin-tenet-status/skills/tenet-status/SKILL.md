---
name: tenet-status
description: Owner instructions for the read-only BB Pi thread TENET status plugin.
disable-model-invocation: true
---

# TENET status

The owner can open **TENET** in BB navigation, then choose a project and Pi thread. Only the selected thread reads its exact-linked archive on its BB machine. Stopped Pi threads need reachable metadata, machine and archive, not evaluator credentials or a running Pi process.

Select a **Linked session**, category and call in the shared overview. BB Back/Forward restores these main-page selections. **Choose project** and **Choose Pi thread** clear the old scope.

**View flagged rules** keeps the old findings route. Use **Next projects** or **Next threads** for more metadata; an empty page is not complete Pi coverage if another page is available.

For the conversation view, open **TENET rules**, then **Open thread overview**. In a narrow container, switch between **Calls** and **Summary**. **Refresh archive** restarts page reads after a failure; the main route keeps its session, call and category.

For a selected call, open **Why this assessment** and **Browse all rules**. Each page has at most 16 rules. Use **More rules** or **First rule page**; check the page count and missing-snapshot notices.

Rule text over 2,048 characters has an omission marker. Thresholds and probabilities come from the recorded contract, not the current policy. Released permission does not prove execution.

Missing records mean unknown, not pass. Evaluator failures, selected FAIL and archive warnings remain separate.

When testing either entry point offline, follow the [synthetic preview steps](../../README.md#try-the-panel-offline) and [main-page steps](../../README.md#try-the-main-page-offline). They install or reload nothing. Complete live-history recovery, native navigation and deployed host behavior need later checks.

Inspect raw evidence only in the standalone inspector on the selected thread's machine with the same private archive. Follow the [rule limits and raw inspection steps](../../README.md#limits-and-privacy). Another machine's inspector is not a fallback. Opening either BB view starts no inspector listener. This plugin does not enable Tenet, start assessments, grant permission or write agent messages.

For installation and custom archive paths, read [the plugin README](../../README.md). A missing link means coverage is unknown. Use TENET's standalone inspector for historical records without `BB_THREAD_ID`.
