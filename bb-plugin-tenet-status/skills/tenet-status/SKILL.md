---
name: tenet-status
description: Owner instructions for the read-only BB Pi thread TENET status plugin.
disable-model-invocation: true
---

# TENET status

The owner opens **TENET rules** in a Pi thread header. This plugin reads linked archive records on the thread's BB machine. It does not enable TENET, start assessments, grant permission, or write agent messages.

For installation and custom archive paths, read [the plugin README](../../README.md). A missing link means coverage is unknown. Use TENET's standalone inspector for historical records without `BB_THREAD_ID`.
