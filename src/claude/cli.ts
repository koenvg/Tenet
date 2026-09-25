#!/usr/bin/env bun
import { createJevJudge } from '../decision/jev.js';
import { ActivationStore } from '../runtime/activation.js';
import { readMode } from '../runtime/config.js';
import { defaultDirectory, exchange, MAX_FRAME, startBridge, type BridgeRequest } from './bridge.js';
import { denial, handleHook } from './hook.js';

function input(limit: number, deadline: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = (value?: string) => {
      clearTimeout(timer);
      process.stdin.off('data', data); process.stdin.off('end', end); process.stdin.off('error', fail);
      if (value === undefined) reject(new Error('invalid-stdin')); else resolve(value);
    };
    const timer = setTimeout(() => finish(), deadline);
    const fail = () => finish();
    const end = () => {
      try { finish(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { finish(); }
    };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) finish(); else chunks.push(chunk);
    };
    process.stdin.on('data', data).once('end', end).once('error', fail);
  });
}

const directory = process.env.TENET_CLAUDE_DIR ?? defaultDirectory();
if (process.argv[2] === 'bridge') {
  try {
    const server = await startBridge({ directory, env: process.env, judge: createJevJudge({ apiKey: process.env.TYPESAFE_API_KEY }), hasJudge: !!process.env.TYPESAFE_API_KEY?.trim() });
    const stop = () => { void server.close().then(() => process.exit(0)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.error('TENET Claude bridge running. Host coverage unverified.');
  } catch { console.error('TENET Claude bridge could not start: check private directory and socket path.'); process.exitCode = 1; }
} else if (process.argv[2] === 'hook') {
  const event = process.argv[3];
  let output: string;
  try {
    const raw = await input(MAX_FRAME, 700);
    output = await Promise.race([
      handleHook(raw, { event, directory, env: process.env, deadlineMs: 3300 }),
      new Promise<string>(resolve => setTimeout(() => resolve(event === 'PreToolUse' && process.env.TENET_MODE === 'enforce' ? denial('unavailable') : '{}\n'), 4100)),
    ]);
  } catch { output = event === 'PreToolUse' && process.env.TENET_MODE === 'enforce' ? denial('unavailable') : '{}\n'; }
  process.stdout.write(output, () => process.exit(0));
} else if (['status', 'on', 'off'].includes(process.argv[2] ?? '') && (process.argv.length === 3 || (process.argv[2] === 'status' && process.argv.length === 4))) {
  const control = new ActivationStore(process.env.TENET_CONTROL_PATH);
  if (process.argv[2] === 'status') {
    const sessionId = process.argv[3] ?? '';
    if (sessionId.length > 256 || /[\x00-\x1f\x7f]/.test(sessionId)) {
      console.error('Invalid session ID.'); process.exitCode = 2;
    } else {
      const request: BridgeRequest = { version: 1, event: 'status', sessionId, contextId: 'main', cwd: process.cwd() };
      const response = await exchange(directory, request, 500);
      const bridge = response.decision === 'pass' && response.status && response.mode ? response : undefined;
      const readiness = bridge?.status?.readiness;
      const activation = control.read();
      const capture = bridge?.status?.capture;
      let captureStatus = 'unknown (bridge unavailable)';
      if (activation !== 'on') captureStatus = 'off for new calls (queued writes may finish)';
      else if (capture && !capture.enabled) captureStatus = 'off or unavailable (bridge capture disabled)';
      else if (capture) {
        const lost = capture.failed + capture.dropped;
        captureStatus = lost ? `degraded (bridge configured on; ${lost} lost; ${capture.pending} pending)`
          : `on (bridge configured; best effort; ${capture.pending} pending)`;
      }
      console.log([
        `activation: ${activation}`,
        `mode: ${readMode(process.env).mode} (this CLI; running processes keep their own mode)`,
        `bridge: ${bridge ? 'running' : 'unavailable (stopped, unreachable, or incompatible)'}`,
        'coverage: unverified (Claude actual-host profile not established)',
        `bridge mode: ${bridge?.mode ?? 'unknown'}`,
        `session eligibility: ${readiness ? readiness.eligible ? 'eligible' : 'dormant' : 'unknown'}`,
        `policy readiness: ${readiness ? readiness.reason ?? readiness.policy : 'unknown (no selected running session)'}`,
        `capture: ${captureStatus}`,
      ].join('\n'));
    }
  } else {
    try {
      const choice = process.argv[2] as 'on' | 'off';
      if (await control.write(choice) !== choice) throw new Error('control-mismatch');
      console.log(`TENET ${choice.toUpperCase()} saved. Other runtimes not acknowledged; pending work may have completed before observing ${choice}.`);
    } catch { console.error('TENET control update failed; choice not confirmed.'); process.exitCode = 1; }
  }
} else {
  console.error('Usage: bun src/claude/cli.ts bridge | hook EVENT | status [session-id] | on | off');
  process.exitCode = 2;
}
