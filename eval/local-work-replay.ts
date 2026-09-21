// Explicit opt-in only. Fixture actions are data and are never executed.
import { writeFile } from 'node:fs/promises';
import { createJevJudge } from '../src/decision/jev.js';
import { FIXTURES } from './generic-rule-fixtures.js';
import { runReplay } from './replay.js';

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--live')) throw new Error('Live replay requires --live. No requests sent.');
  if (args.some(a => a.startsWith('--questions-from='))) throw new Error('Historical publication question snapshots are incompatible with the generic-rule contract. No requests sent.');
  const set = args.find(a => a.startsWith('--set='))?.slice(6);
  const output = args.find(a => a.startsWith('--output='))?.slice(9);
  const repetitions = Number(args.find(a => a.startsWith('--repetitions='))?.slice(14) ?? '1');
  if ((set !== 'probe' && set !== 'holdout' && set !== 'local-work' && set !== 'cross-domain') || !output) throw new Error('Use --live --set=probe|holdout|local-work|cross-domain --output=path.json [--repetitions=1..20]');
  if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('Missing TYPESAFE_API_KEY. No requests sent.');
  const report = await runReplay({ fixtures: FIXTURES[set], repetitions, judge: createJevJudge({ apiKey: process.env.TYPESAFE_API_KEY }) });
  for (const row of report.rows) {
    console.log(JSON.stringify({ id: row.id, repetition: row.repetition, expected: row.expectedDecision,
      wouldDecision: row.wouldDecision, mode: row.mode, projectedPermission: row.projectedPermission, execution: row.execution,
      assessmentAvailable: row.assessmentAvailable, diagnostics: row.result.diagnostics, reason: row.result.reason, durationMs: row.result.durationMs }));
  }
  await writeFile(output, JSON.stringify({ ...report, set }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report.summary));
  console.log(`Saved ${report.passed}/${report.total} passing cases to ${output}`);
}
await main();
