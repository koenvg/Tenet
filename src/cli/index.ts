#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { diagnoseProject, formatDoctor } from '../doctor/doctor.js';

const usage = 'Usage: node /path/to/tenet/dist/cli/index.js doctor [--project DIRECTORY] [--json]\n';
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let projectDir = process.cwd(), json = false, projectSelected = false;
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) { process.stdout.write(usage); return; }
  if (args.shift() !== 'doctor') throw new Error('usage');
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json' && !json) json = true;
    else if (arg === '--project' && !projectSelected && args[0] && !args[0].startsWith('--')) {
      projectDir = args.shift()!; projectSelected = true;
    } else if ((arg === '--help' || arg === '-h') && !args.length) { process.stdout.write(usage); return; }
    else throw new Error('usage');
  }
  const report = await diagnoseProject({ projectDir, env: process.env,
    deliveryDir: fileURLToPath(new URL('../../', import.meta.url)) });
  process.stdout.write(json ? JSON.stringify(report) + '\n' : formatDoctor(report));
  process.exitCode = report.exitCode;
}
main().catch(() => {
  // Never print thrown filesystem/configuration errors or command arguments.
  process.stdout.write(process.argv.includes('--json')
    ? JSON.stringify({ schemaVersion: 1, state: 'invalid', exitCode: 2, issues: [{ code: 'doctor-invocation', guidance: usage.trim() }] }) + '\n'
    : 'TENET doctor: invalid invocation or unavailable inspection.\n' + usage);
  process.exitCode = 2;
});
