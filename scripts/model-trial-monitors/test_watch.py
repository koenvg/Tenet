"""Offline monitor acceptance tests. No SSH, model, or BB calls."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parent


def load_monitor(model):
    spec = importlib.util.spec_from_file_location(model, ROOT / (model + "_watch.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MonitorTests(unittest.TestCase):
    def exercise(self, scenario):
        for model in ("apus", "clef"):
            with self.subTest(model=model), tempfile.TemporaryDirectory() as directory:
                monitor = load_monitor(model)
                root = Path(directory)
                state_path = root / (model + "-watch-test-automation.json")
                with sqlite3.connect(root / "queue.sqlite") as queue:
                    queue.execute("CREATE TABLE notices (event_id TEXT PRIMARY KEY, message TEXT NOT NULL)")
                    attempts = []
                    pauses = []
                    probes = []
                    replaced = Path.replace
                    stop = [scenario in ("crash", "before-enqueue")]
                    if scenario == "legacy":
                        state_path.write_text(json.dumps({"terminal_notified": True}))

                    def replace(path, target):
                        state = json.loads(path.read_text())
                        should_stop = state.get("terminal_notified") if scenario == "crash" else state.get("terminal_event")
                        if stop[0] and should_stop:
                            stop[0] = False
                            raise OSError("stop at state commit")
                        return replaced(path, target)

                    def run(command, **kwargs):
                        if command[0] == "ssh":
                            probes.append(command)
                            if len(probes) > 1 and scenario not in ("running", "before-enqueue"):
                                raise subprocess.TimeoutExpired(command, 35)
                            return subprocess.CompletedProcess(command, 0, json.dumps({
                                "status": "running" if scenario == "running" else "complete",
                                "installer_alive": scenario == "running",
                            }))
                        if command[1:3] == ["automation", "pause"]:
                            pauses.append(command)
                            if scenario == "pause" and len(pauses) == 1:
                                raise subprocess.TimeoutExpired(command, 30)
                            return subprocess.CompletedProcess(command, 0, "{}")
                        self.assertEqual(command[1:4], ["thread", "queue", "create"])
                        self.assertEqual(command[4], monitor.THREAD)
                        attempts.append(command)
                        event = json.loads(state_path.read_text())["terminal_event"]
                        self.assertEqual(kwargs["input"], event["message"])
                        key = command[command.index("--idempotency-key") + 1]
                        self.assertEqual(key, event["id"])
                        if scenario == "failure" and len(attempts) == 1:
                            raise subprocess.CalledProcessError(1, command)
                        old = queue.execute("SELECT message FROM notices WHERE event_id = ?", (key,)).fetchone()
                        if old:
                            self.assertEqual(old[0], kwargs["input"])
                        queue.execute("INSERT OR IGNORE INTO notices VALUES (?, ?)", (key, kwargs["input"]))
                        queue.commit()
                        if scenario == "timeout" and len(attempts) == 1:
                            raise subprocess.TimeoutExpired(command, 30)
                        return subprocess.CompletedProcess(command, 0, "{}")

                    umask = os.umask(0o077)
                    try:
                        with patch.dict(os.environ, {"BB_PROJECT_ID": monitor.PROJECT, "BB_AUTOMATION_ID": "test-automation", "BB_CLI": "bb-test-only"}), patch.object(Path, "cwd", return_value=root), patch.object(monitor.subprocess, "run", side_effect=run), patch.object(Path, "replace", replace):
                            if scenario in ("crash", "timeout", "failure", "pause", "before-enqueue"):
                                with self.assertRaises((OSError, subprocess.SubprocessError)):
                                    monitor.main()
                                state = json.loads(state_path.read_text()) if state_path.exists() else {}
                                self.assertEqual(bool(state.get("terminal_notified")), scenario == "pause")
                            else:
                                monitor.main()
                            monitor.main()
                            monitor.main()
                    finally:
                        os.umask(umask)
                    expected_notices = 0 if scenario in ("running", "legacy") else 1
                    self.assertEqual(queue.execute("SELECT COUNT(*) FROM notices").fetchone()[0], expected_notices)
                    self.assertEqual(bool(pauses), scenario != "running")
                    state = json.loads(state_path.read_text())
                    self.assertEqual(bool(state.get("terminal_notified")), scenario != "running")
                    if expected_notices:
                        self.assertEqual(len(probes), 2 if scenario == "before-enqueue" else 1)
                        self.assertEqual(len(attempts), 2 if scenario in ("crash", "timeout", "failure") else 1)
                    if scenario == "legacy":
                        self.assertEqual(probes, [])
                        self.assertEqual(attempts, [])
                queue.close()

    def test_crash_after_successful_enqueue(self):
        self.exercise("crash")

    def test_timeout_after_accepted_enqueue(self):
        self.exercise("timeout")

    def test_retry_after_actual_delivery_failure(self):
        self.exercise("failure")

    def test_completed_trial_notifies_once_and_pauses(self):
        self.exercise("normal")

    def test_pause_failure_does_not_repeat_delivery(self):
        self.exercise("pause")

    def test_crash_before_enqueue_does_not_lose_notice(self):
        self.exercise("before-enqueue")

    def test_running_trial_keeps_monitoring_without_a_notice(self):
        self.exercise("running")

    def test_previously_notified_trial_does_not_send_again(self):
        self.exercise("legacy")


class ConnectionHarness:
    """Run monitor ticks against a durable fake queue, never real commands."""

    def __init__(self, test, model, root, queue):
        self.test = test
        self.monitor = load_monitor(model)
        self.root = root
        self.state_path = root / (model + "-watch-test-automation.json")
        self.queue = queue
        queue.execute("CREATE TABLE notices (event_id TEXT PRIMARY KEY, message TEXT NOT NULL)")
        self.attempts = []
        self.probes = 0

    def state(self):
        return json.loads(self.state_path.read_text()) if self.state_path.exists() else {}

    def notices(self):
        return self.queue.execute("SELECT event_id, message FROM notices ORDER BY rowid").fetchall()

    def tick(self, probe="failure", delivery="accept", crash=False):
        replaced = Path.replace

        def replace(path, target):
            if crash and json.loads(path.read_text()).get("connection_alerted"):
                raise OSError("crash after acceptance, before state commit")
            return replaced(path, target)

        def run(command, **kwargs):
            if command[0] == "ssh":
                self.probes += 1
                if probe == "failure":
                    raise subprocess.TimeoutExpired(command, 35)
                return subprocess.CompletedProcess(command, 0, json.dumps({
                    "status": probe, "installer_alive": probe == "running",
                }))
            self.test.assertEqual(command[1:4], ["thread", "queue", "create"])
            self.test.assertEqual(command[4], self.monitor.THREAD)
            key = command[command.index("--idempotency-key") + 1]
            event = self.state()["connection_event"]
            self.test.assertEqual(key, event["id"])
            self.test.assertEqual(kwargs["input"], event["message"])
            self.test.assertFalse(self.state().get("connection_alerted"))
            self.attempts.append((key, kwargs["input"]))
            if delivery == "reject":
                raise subprocess.CalledProcessError(1, command)
            old = self.queue.execute("SELECT message FROM notices WHERE event_id = ?", (key,)).fetchone()
            if old:
                self.test.assertEqual(old[0], kwargs["input"])
            self.queue.execute("INSERT OR IGNORE INTO notices VALUES (?, ?)", (key, kwargs["input"]))
            self.queue.commit()
            if delivery == "timeout":
                raise subprocess.TimeoutExpired(command, 30)
            return subprocess.CompletedProcess(command, 0, "{}")

        umask = os.umask(0o077)
        try:
            with patch.dict(os.environ, {"BB_PROJECT_ID": self.monitor.PROJECT, "BB_AUTOMATION_ID": "test-automation", "BB_CLI": "bb-test-only"}), patch.object(Path, "cwd", return_value=self.root), patch.object(self.monitor.subprocess, "run", side_effect=run), patch.object(Path, "replace", replace):
                self.monitor.main()
        finally:
            os.umask(umask)

    def reach_threshold(self, **kwargs):
        attempts = len(self.attempts)
        self.tick()
        self.tick()
        self.test.assertEqual(len(self.attempts), attempts)
        self.tick(**kwargs)


class ConnectionAlertTests(unittest.TestCase):
    def exercise(self, case):
        for model in ("apus", "clef"):
            with self.subTest(model=model), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                with sqlite3.connect(root / "queue.sqlite") as queue:
                    case(ConnectionHarness(self, model, root, queue))

    def test_alert_only_after_three_consecutive_failures(self):
        def case(h):
            h.tick()
            h.tick()
            h.tick(probe="running")
            self.assertEqual(h.state()["probe_failures"], 0)
            h.reach_threshold()
            h.tick()
            h.tick()
            self.assertEqual(len(h.attempts), 1)
            self.assertEqual(len(h.notices()), 1)
            self.assertTrue(h.state()["connection_alerted"])
            self.assertFalse(h.state().get("terminal_notified"))
        self.exercise(case)

    def test_connection_crash_after_acceptance_reuses_saved_event(self):
        def case(h):
            with self.assertRaises(OSError):
                h.reach_threshold(crash=True)
            event = h.state()["connection_event"]
            self.assertFalse(h.state().get("connection_alerted"))
            self.assertEqual(len(h.notices()), 1)
            h.tick()
            h.tick()
            self.assertEqual(h.state()["connection_event"], event)
            self.assertEqual(h.attempts, [h.notices()[0], h.notices()[0]])
            self.assertTrue(h.state()["connection_alerted"])
        self.exercise(case)

    def test_connection_timeout_after_acceptance_reuses_saved_event(self):
        def case(h):
            with self.assertRaises(subprocess.TimeoutExpired):
                h.reach_threshold(delivery="timeout")
            event = h.state()["connection_event"]
            self.assertFalse(h.state().get("connection_alerted"))
            self.assertEqual(len(h.notices()), 1)
            h.tick()
            h.tick()
            self.assertEqual(h.state()["connection_event"], event)
            self.assertEqual(h.attempts, [h.notices()[0], h.notices()[0]])
            self.assertTrue(h.state()["connection_alerted"])
        self.exercise(case)

    def test_connection_rejection_remains_pending_until_acceptance(self):
        def case(h):
            with self.assertRaises(subprocess.CalledProcessError):
                h.reach_threshold(delivery="reject")
            event = h.state()["connection_event"]
            self.assertFalse(h.state().get("connection_alerted"))
            self.assertEqual(h.notices(), [])
            with self.assertRaises(subprocess.CalledProcessError):
                h.tick(delivery="reject")
            self.assertEqual(h.state()["connection_event"], event)
            self.assertFalse(h.state().get("connection_alerted"))
            h.tick()
            h.tick()
            self.assertEqual(h.attempts, [h.notices()[0]] * 3)
            self.assertTrue(h.state()["connection_alerted"])
        self.exercise(case)

    def test_later_interruption_after_recovery_gets_a_new_key(self):
        def case(h):
            h.reach_threshold()
            first = h.notices()[0]
            h.tick(probe="running")
            self.assertFalse(h.state()["connection_alerted"])
            self.assertNotIn("connection_event", h.state())
            h.tick()
            h.tick()
            self.assertEqual(h.notices(), [first])
            h.tick()
            h.tick()
            self.assertEqual(len(h.notices()), 2)
            self.assertNotEqual(h.notices()[1][0], first[0])
            self.assertEqual(h.notices()[1][1], first[1])
            self.assertEqual(len(h.attempts), 2)
        self.exercise(case)

    def test_pending_alert_is_retried_before_recovery_can_clear_it(self):
        def case(h):
            with self.assertRaises(subprocess.TimeoutExpired):
                h.reach_threshold(delivery="timeout")
            self.assertEqual(h.probes, 3)
            with self.assertRaises(subprocess.CalledProcessError):
                h.tick(probe="running", delivery="reject")
            self.assertEqual(h.probes, 3)
            h.tick(probe="running")
            self.assertEqual(len(h.notices()), 1)
            self.assertEqual(h.attempts, [h.notices()[0]] * 3)
            self.assertNotIn("connection_event", h.state())
            h.reach_threshold()
            self.assertEqual(len(h.notices()), 2)
        self.exercise(case)


if __name__ == "__main__":
    unittest.main()
