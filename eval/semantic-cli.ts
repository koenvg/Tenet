import { open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createJevJudge } from '../src/decision/jev.js';
import { MODEL } from '../src/decision/typesafe-contract.js';
import { semanticCases } from './semantic-fixtures.js';
import { replaySemantic, scriptedJudge } from './semantic-replay.js';

export function parseReplayArgs(args: string[], env: NodeJS.ProcessEnv) {
  const live = args.includes('--live');
  const authorized = args.includes('--authorize-evidence-disclosure');
  const outputAt = args.indexOf('--output');
  const output = outputAt < 0 ? undefined : args[outputAt + 1];
  const known = new Set(['--live', '--authorize-evidence-disclosure', '--output']);
  for (const [i, arg] of args.entries()) {
    if (i === outputAt + 1 && outputAt >= 0) continue;
    if (!known.has(arg)) throw Error(`Unknown argument: ${arg}`);
    if (args.indexOf(arg) !== i) throw Error(`Duplicate argument: ${arg}`);
  }
  if (!output || output.startsWith('--')) throw Error('Required: --output <report.json>');
  if (live && (!authorized || !env.TYPESAFE_API_KEY?.trim())) throw Error('Live replay requires --authorize-evidence-disclosure and TYPESAFE_API_KEY. No requests sent.');
  if (!live && authorized) throw Error('Authorization flag requires --live');
  return { live, output };
}
export async function main(args = process.argv.slice(2), env = process.env) {
  const { live, output } = parseReplayArgs(args, env);
  // Reserve the report before any disclosure, so an existing/unwritable path fails offline.
  const file = await open(output, 'wx');
  let report: Awaited<ReturnType<typeof replaySemantic>>;
  try {
    report = await replaySemantic({ cases: semanticCases, live,
      judge: live ? createJevJudge({ apiKey: env.TYPESAFE_API_KEY }) : scriptedJudge,
      judgeIdentity: live ? { provider: 'typesafe', requestedModel: MODEL } : undefined,
      // Offline durations are synthetic and deterministic, never performance evidence.
      clock: live ? undefined : { now: () => 0, schedule: () => () => {} },
    });
    await file.writeFile(JSON.stringify(report, null, 2) + '\n');
  } finally { await file.close(); }
  console.log(`Wrote ${output}. Canonical ${report.canonicalPassed ? 'passed' : 'failed'}; validated POC: ${report.validatedPOC}.`);
  if (live && !report.validatedPOC) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
