#!/usr/bin/env python3
"""Check owned process-group cleanup without starting Tenet or using owner state."""
import importlib.util
from pathlib import Path
import signal
import subprocess
import sys
import unittest
from unittest.mock import patch
import os
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('verification_run', Path(__file__).with_name('run.py'))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

DESCENDANT = "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); print('ready', flush=True); time.sleep(60)"
PARENT = """
import subprocess,sys,time
child = subprocess.Popen([sys.executable, '-I', '-u', '-c', sys.argv[1]], stdout=subprocess.PIPE, text=True)
assert child.stdout.readline().strip() == 'ready'
print(child.pid, flush=True)
if sys.argv[2] == 'failure':
    sys.exit(7)
time.sleep(60)
"""


class CleanupTests(unittest.TestCase):
    def resistant_descendant(self, reason, env=None):
        parent = subprocess.Popen([sys.executable, '-I', '-u', '-c', PARENT, DESCENDANT, reason],
                                  stdout=subprocess.PIPE, text=True, start_new_session=True, env=env)
        try:
            descendant = int(parent.stdout.readline())
            if reason == 'failure':
                self.assertEqual(parent.wait(timeout=5), 7)
            else:
                parent.send_signal(signal.SIGTERM)
                self.assertEqual(parent.wait(timeout=5), -signal.SIGTERM)
            self.assertTrue(launcher.group_alive(parent.pid), 'descendant must survive direct-child exit')
            launcher.stop_group(parent, grace=1)
            self.assertFalse(launcher.group_alive(parent.pid), 'owned group must be gone before scratch deletion')
            with self.assertRaises(ProcessLookupError):
                launcher.os.kill(descendant, 0)
        finally:
            launcher.stop_group(parent, grace=1)
            parent.stdout.close()

    def test_failure_reaps_term_resistant_descendant(self):
        self.resistant_descendant('failure')

    def test_interrupt_reaps_term_resistant_descendant(self):
        self.resistant_descendant('interrupt')

    def test_all_generations_ignore_python_startup_hooks(self):
        with TemporaryDirectory(prefix='tenet-python-isolation-', dir='/tmp') as root:
            marker = Path(root) / 'startup-ran'
            (Path(root) / 'sitecustomize.py').write_text(
                'from pathlib import Path\nimport os\n'
                'Path(os.environ["TENET_PYTHON_MARKER"]).write_text("unsafe startup")\n')
            env = {**os.environ, 'PYTHONPATH': root, 'PYTHONUSERBASE': root,
                   'TENET_PYTHON_MARKER': str(marker)}
            self.resistant_descendant('failure', env)
            self.assertFalse(marker.exists(), 'every Python generation must ignore startup hooks')

    def test_unconfirmed_shutdown_raises_instead_of_allowing_removal(self):
        child = unittest.mock.Mock(pid=12345)
        with patch.object(launcher, 'group_alive', return_value=True), patch.object(launcher.os, 'killpg'):
            with self.assertRaisesRegex(RuntimeError, 'retain scratch'):
                launcher.stop_group(child, grace=0)


if __name__ == '__main__':
    unittest.main()
