#!/usr/bin/env python3
"""Run checkout verification with disposable owner state and retained evidence."""
import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import subprocess
import tempfile
import time


def group_alive(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False


def stop_group(child, grace=5):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        if not group_alive(child.pid):
            break
        try:
            os.killpg(child.pid, sig)
        except ProcessLookupError:
            break
        deadline = time.monotonic() + grace
        while group_alive(child.pid) and time.monotonic() < deadline:
            child.poll()
            time.sleep(0.05)
    child.poll()
    if group_alive(child.pid):
        raise RuntimeError(f'process group {child.pid} still exists; retain scratch')
    child.wait(timeout=grace)


def interrupted(signum, _frame):
    raise KeyboardInterrupt(f'interrupted by signal {signum}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('feature', choices=['proof', 'guard', 'control', 'preflight'])
    parser.add_argument('--browser-cache', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    cache = args.browser_cache.resolve(strict=True)
    evidence = args.evidence.resolve()
    if not args.evidence.is_absolute() or evidence.exists():
        parser.error('--evidence must be a new absolute directory outside the checkout')
    if evidence.is_relative_to(repo):
        parser.error('keep evidence outside the checkout')
    bun, node = shutil.which('bun'), shutil.which('node')
    if not bun or not node:
        parser.error('Bun 1.3.14+ and Node 22.19+ must be on PATH')
    evidence.mkdir(mode=0o700, parents=True)
    scratch = Path(tempfile.mkdtemp(prefix='tenet-verify-', dir='/tmp')).resolve()
    child = None
    results = []
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        home, bin_dir = scratch / 'home', scratch / 'bin'
        home.mkdir(mode=0o700)
        bin_dir.mkdir()
        wrapper = bin_dir / 'bun'
        wrapper.write_text('#!/bin/sh\nexec ' + shlex.quote(bun) + ' --no-env-file "$@"\n')
        wrapper.chmod(0o700)
        env = dict(PATH=f'{bin_dir}:{os.environ["PATH"]}', HOME=str(home), TMPDIR=str(scratch), CI='1',
                   BUN_OPTIONS='--no-env-file', XDG_CONFIG_HOME=str(home / '.config'),
                   XDG_CACHE_HOME=str(home / '.cache'), XDG_DATA_HOME=str(home / '.local/share'),
                   PI_CODING_AGENT_DIR=str(home / 'pi'), npm_config_cache=str(home / '.npm'),
                   npm_config_userconfig=str(home / '.npmrc'), npm_config_globalconfig=str(home / '.npm-globalrc'),
                   PLAYWRIGHT_BROWSERS_PATH=str(cache), TENET_VERIFY_EVIDENCE=str(evidence))
        scripts = Path(__file__).resolve().parent
        selected = {
            'proof': [(repo, [bun, '--no-env-file', 'run', 'inspector:build']),
                      (evidence, [node, str(repo / 'node_modules/playwright/cli.js'), 'test',
                                  '--config', str(scripts / 'playwright.config.ts')])],
            'guard': [(repo, [bun, '--no-env-file', 'test', '--isolate', '--max-concurrency=1', '--timeout=30000',
                             'test/pi-smoke.test.ts'])],
            'control': [(repo, [bun, '--no-env-file', 'test', '--isolate', '--max-concurrency=1', '--timeout=30000',
                               'test/global-control.test.ts', 'test/owner-cli.test.ts'])],
            'preflight': [(repo, [bun, '--no-env-file', 'test', '--isolate', '--max-concurrency=1', '--timeout=30000',
                                 'test/doctor.test.ts'])],
        }
        commands = [(repo, [node, '--version']), (repo, [bun, '--version']),
                    (repo, [bun, '--no-env-file', 'run', 'sdk:build']), *selected[args.feature]]
        with (evidence / 'commands.log').open('w') as log:
            for cwd, command in commands:
                result = dict(command=command, cwd=str(cwd), exitCode=None)
                results.append(result)
                log.write('$ ' + shlex.join(command) + '\n')
                log.flush()
                child = subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT,
                                         start_new_session=True)
                try:
                    code = child.wait(timeout=180)
                finally:
                    stop_group(child)
                    result['exitCode'] = child.returncode
                    log.write(f'exit={child.returncode}\n')
                    log.flush()
                    child = None
                if code:
                    raise RuntimeError(f'command exited {code}; see {evidence / "commands.log"}')
    finally:
        try:
            if child is not None:
                stop_group(child)
            shutil.rmtree(scratch)
        finally:
            removed = not scratch.exists()
            (evidence / 'run.json').write_text(json.dumps(dict(feature=args.feature, commands=results,
                scratch=str(scratch), scratchRemoved=removed), indent=2) + '\n')
            print(f'Evidence retained at {evidence}; scratch removed={removed}; scratch={scratch}', flush=True)


if __name__ == '__main__':
    main()
