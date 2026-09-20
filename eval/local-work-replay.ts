// Explicit opt-in only. Fixture actions are data and are never executed.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createJevJudge } from '../src/decision/jev.js';
import { buildQuestions } from '../src/decision/questions.js';
import { decide, QUESTION_VERSION } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { FIXTURES, FIXTURE_CWD, fixturePolicy } from './generic-rule-fixtures.js';

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--live')) throw new Error('Live replay requires --live. No requests sent.');
  if (args.some(a => a.startsWith('--questions-from='))) throw new Error('Historical publication question snapshots are incompatible with the generic-rule contract. No requests sent.');
  const set = args.find(a => a.startsWith('--set='))?.slice(6);
  const output = args.find(a => a.startsWith('--output='))?.slice(9);
  if ((set !== 'probe' && set !== 'holdout') || !output) throw new Error('Use --live --set=probe|holdout --output=path.json');
  if (!process.env.TYPESAFE_API_KEY?.trim()) throw new Error('Missing TYPESAFE_API_KEY. No requests sent.');
  const judge = createJevJudge({ apiKey: process.env.TYPESAFE_API_KEY });
  const rows = [];
  for (const fixture of FIXTURES[set]) {
    const policy = fixturePolicy(fixture);
    const action = captureAction({ ...fixture.input, sessionId: 'synthetic-replay', callId: fixture.id }, fixture.sensitiveFields);
    const questions = buildQuestions(policy);
    const result = await decide({ policy, action, cwd: FIXTURE_CWD, judge });
    const expected = [...fixture.outcomes, fixture.integrity];
    const passed = result.decision === fixture.expectedDecision && result.assessment?.rules.every((r, i) => r.outcome.choice === expected[i]);
    rows.push({ id: fixture.id, policy, action, questions, questionDigest: createHash('sha256').update(JSON.stringify(questions)).digest('hex'),
      expectedOutcomes: expected, expectedDecision: fixture.expectedDecision, result, passed: !!passed });
    console.log(JSON.stringify({ id: fixture.id, expected: fixture.expectedDecision, actual: result.decision, rules: result.assessment?.rules, reason: result.reason, durationMs: result.durationMs }));
  }
  await writeFile(output, JSON.stringify({ timestamp: new Date().toISOString(), fixtureVersion: 'generic-rules-v1', set,
    questionVersion: QUESTION_VERSION, passed: rows.filter(r => r.passed).length, total: rows.length, rows }, null, 2) + '\n', { flag: 'wx' });
  console.log(`Saved ${rows.filter(r => r.passed).length}/${rows.length} passing cases to ${output}`);
}
await main();
