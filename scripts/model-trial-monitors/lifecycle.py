"""Durable delivery and recovery rules shared by the model-trial monitors."""
import json
import os
from pathlib import Path
import subprocess
import uuid


def run_monitor(*, model, project, thread, probe_script, terminal, completion_message, connection_message):
    os.umask(0o077)
    automation = os.environ["BB_AUTOMATION_ID"]
    assert os.environ["BB_PROJECT_ID"] == project
    state_path = Path.cwd() / (model + "-watch-" + automation + ".json")
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    bb = os.environ.get("BB_CLI") or "bb"

    def save():
        tmp = state_path.with_suffix(".tmp")
        with tmp.open("w") as handle:
            json.dump(state, handle)
            handle.flush()
            os.fsync(handle.fileno())
        tmp.replace(state_path)
        directory = os.open(state_path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def notify(event):
        subprocess.run([bb, "thread", "queue", "create", thread, "--idempotency-key", event["id"],
                        "--message-file", "-", "--json"], input=event["message"],
                       text=True, capture_output=True, check=True, timeout=30)

    def pause():
        subprocess.run([bb, "automation", "pause", automation, "--project", project, "--json"],
                       capture_output=True, text=True, check=True, timeout=30)

    def finish_connection():
        notify(state["connection_event"])
        state["connection_alerted"] = True
        save()

    def finish_terminal():
        notify(state["terminal_event"])
        state["terminal_notified"] = True
        save()
        pause()

    if state.get("terminal_notified"):
        pause()
        return
    if state.get("terminal_event"):
        finish_terminal()
        return
    if state.get("connection_event") and not state.get("connection_alerted"):
        finish_connection()
    try:
        process = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "pika", "python3 -"],
                                 input=probe_script, text=True, capture_output=True, check=True, timeout=35)
        probe = json.loads(process.stdout)
        if (not isinstance(probe, dict)
                or not isinstance(probe.get("status"), str)
                or not isinstance(probe.get("installer_alive"), bool)):
            raise ValueError("Probe requires an object with status string and installer_alive Boolean")
    except (subprocess.SubprocessError, OSError, ValueError):
        state["probe_failures"] = state.get("probe_failures", 0) + 1
        if state["probe_failures"] >= 3 and not state.get("connection_alerted"):
            state["connection_event"] = {
                "id": "model-trial:" + automation + ":connection:" + uuid.uuid4().hex,
                "message": connection_message,
            }
            save()
            finish_connection()
        save()
        return
    state["probe_failures"] = 0
    state["connection_alerted"] = False
    state.pop("connection_event", None)
    if terminal(probe):
        state["terminal_event"] = {
            "id": "model-trial:" + automation + ":terminal",
            "message": completion_message(probe),
        }
        save()
        finish_terminal()
    else:
        save()
