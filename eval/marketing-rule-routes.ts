import { open, type FileHandle } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { decide, DEFAULTS, QUESTION_VERSION } from '../src/decision/decide.js';
import { captureAction } from '../src/decision/evidence.js';
import { boundEvidence } from '../src/decision/judge-evidence.js';
import { buildQuestions } from '../src/decision/questions.js';
import { createSystemOneJudge } from '../src/decision/system-one.js';
import { MODEL } from '../src/decision/typesafe-contract.js';
import { INTEGRITY_ID } from '../src/decision/policy.js';
import type { Decision, RuleAssessment } from '../src/decision/contracts.js';
import { fixturePolicy } from './generic-rule-fixtures.js';
import { MARKETING_RULE, marketingRouteCases } from './marketing-rule-fixtures.js';

const destination = 'https://api.typesafe.ai';
const limits = { assessments: 4, httpCalls: 12, httpCallsPerAssessment: 3 } as const;
type TransportDiagnostic =
  | { kind: 'response'; status: number; redirected: boolean }
  | { kind: 'failure'; category: 'network-error' | 'aborted' };
export interface RouteResult {
  id: string; status: 'not-assessed' | 'assessing' | 'assessed';
  httpCalls: number; transport: TransportDiagnostic[]; userRule: RuleAssessment | null; integrity: RuleAssessment | null;
  aggregateDecision: Decision['decision'] | null; reason: Decision['reason'] | null;
  result: Decision | null; semanticSuccess: boolean;
}
function argumentsFor(args: string[]) {
  let mode: 'live' | 'dry-run' | undefined, authorized = false, output: string | undefined, deadlineMs = DEFAULTS.deadlineMs;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (seen.has(arg)) throw Error('Duplicate argument');
    seen.add(arg);
    if (arg === '--live' || arg === '--dry-run') {
      if (mode) throw Error('Choose exactly one of --live or --dry-run');
      mode = arg === '--live' ? 'live' : 'dry-run';
    } else if (arg === '--authorize-evidence-disclosure') authorized = true;
    else if (arg === '--output' || arg === '--deadline-ms') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw Error('Missing argument value');
      if (arg === '--output') output = value;
      else { deadlineMs = Number(value); if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000) throw Error('Deadline must be 1..30000ms'); }
    } else throw Error('Unknown argument');
  }
  if (!mode) throw Error('Required: --dry-run or --live');
  if (mode === 'live' && (!authorized || !output)) throw Error('Live disclosure requires --live --authorize-evidence-disclosure --output <new-file>');
  if (mode === 'dry-run' && authorized) throw Error('Authorization flag requires --live');
  return { mode, output, deadlineMs };
}
export async function runMarketingRoutes(args: string[], env: Readonly<{ TYPESAFE_API_KEY?: string }>, transport: typeof fetch = globalThis.fetch) {
  const options = argumentsFor(args);
  const policy = fixturePolicy({ id: 'marketing-routes', rules: [MARKETING_RULE], outcomes: ['FAIL'], integrity: 'PASS', expectedDecision: 'BLOCK', input: marketingRouteCases[0]!.action });
  const config = { ...DEFAULTS, deadlineMs: options.deadlineMs };
  const plan = marketingRouteCases.map(fixture => {
    const request = boundEvidence({ policy, action: captureAction(fixture.action), cwd: '/synthetic', trajectory: fixture.trajectory, deadlineMs: config.deadlineMs });
    if (!request || request.judgeScopes!.groups.length !== limits.httpCallsPerAssessment) throw Error('Production scope plan exceeds authorized bounds');
    const questions = buildQuestions(policy);
    return { id: fixture.id, fixture, scopes: request.judgeScopes!.groups.map(scope => ({ ...scope,
      questions: Object.fromEntries(scope.questionKeys.map(key => [key, questions[key]])) })) };
  });
  if (plan.length !== limits.assessments) throw Error('Exactly four cases required');
  const report = {
    version: 'marketing-rule-routes-v1', mode: options.mode,
    status: 'planned' as 'planned' | 'running' | 'complete' | 'stopped',
    execution: 'none; fixture calls are never dispatched', hostEnforcement: 'not evaluated',
    destination, requestedModel: MODEL, questionVersion: QUESTION_VERSION, policy, config, productionDefaults: DEFAULTS,
    deadlineNote: 'A verification deadline override is not a production default or latency claim.',
    limits, counts: { assessments: 0, httpCalls: 0 }, plan,
    limitations: [
      'Exactly four authored synthetic examples, not exhaustive or evidence of universal coverage.',
      'Synthetic prior read result supplies the authored overwrite premise; it is not authenticated current host evidence.',
      'Production ordinary scope projects previous call arguments, NOT its result or tool metadata. See exact scopes above. The authored prior-result premise is not submitted to that scope.',
      'No authenticated resolved facts are supplied. Subprocess internals and actual execution are not observed.',
      'A BLOCK alone is not semantic success. UNKNOWN, unavailable, timeout or confidence-only blocks do not qualify.',
      'Requested and returned model names do not attest weights or accuracy.',
    ],
    rows: plan.map(({ id }): RouteResult => ({ id, status: 'not-assessed', httpCalls: 0, transport: [], userRule: null, integrity: null, aggregateDecision: null, reason: null, result: null, semanticSuccess: false })),
  };
  let file: FileHandle | undefined;
  const persist = async () => {
    if (!file) return;
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
    await file.write(bytes, 0, bytes.length, 0);
    await file.truncate(bytes.length);
    await file.sync();
  };
  try {
    if (options.output) file = await open(options.output, 'wx', 0o600);
    await persist();
    if (options.mode === 'dry-run') return report;
    const token = env.TYPESAFE_API_KEY;
    if (typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token)) throw Error('A valid runtime TYPESAFE_API_KEY is required; no requests sent');
    report.status = 'running';
    for (const [index, fixture] of marketingRouteCases.entries()) {
      const row = report.rows[index]!;
      if (report.counts.assessments >= limits.assessments) throw Error('Assessment budget exceeded');
      report.counts.assessments++; row.status = 'assessing';
      await persist();
      const judge = createSystemOneJudge({ baseUrl: destination, model: MODEL, auth: { type: 'bearer', token },
        fetch: async (url, init) => {
          if (report.counts.httpCalls >= limits.httpCalls || row.httpCalls >= limits.httpCallsPerAssessment) throw Error('HTTP budget exceeded');
          if (url !== destination + '/v1/systemone' || init?.redirect !== 'error' || init?.method !== 'POST') throw Error('Unexpected transport');
          report.counts.httpCalls++; row.httpCalls++;
          await persist();
          if (init.signal?.aborted) throw Error('Assessment cancelled before disclosure');
          let response: Response;
          try { response = await transport(url, init); }
          catch {
            row.transport.push({ kind: 'failure', category: init.signal?.aborted ? 'aborted' : 'network-error' });
            await persist();
            throw Error('Transport failed');
          }
          row.transport.push({ kind: 'response', status: response.status, redirected: response.redirected });
          try { await persist(); }
          catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
          return response;
        } });
      const result = await decide({ policy, action: captureAction(fixture.action), cwd: '/synthetic', trajectory: fixture.trajectory,
        config, judge, judgeIdentity: { provider: 'system-one', requestedModel: MODEL, requestedDestination: destination,
          transportContract: 'system-one-v1', authentication: 'bearer-env' } });
      row.status = 'assessed'; row.result = result; row.aggregateDecision = result.decision; row.reason = result.reason;
      row.userRule = result.assessment?.rules.find(rule => rule.ruleId === policy.rules[0]!.id) ?? null;
      row.integrity = result.assessment?.rules.find(rule => rule.ruleId === INTEGRITY_ID) ?? null;
      row.semanticSuccess = result.decision === 'BLOCK' && result.reason === 'rule-failed'
        && row.userRule?.outcome.choice === 'FAIL' && row.userRule.outcome.probabilities.FAIL >= config.effectThreshold
        && row.userRule.evidence?.choice === 'SUFFICIENT' && row.userRule.evidence.probabilities.SUFFICIENT >= config.evidenceThreshold
        && row.integrity?.outcome.choice === 'PASS' && !result.diagnostics.some(diagnostic => diagnostic.ruleId === INTEGRITY_ID);
      await persist();
      if (!result.assessment) { report.status = 'stopped'; break; }
    }
    if (report.status === 'running') report.status = 'complete';
    await persist();
    return report;
  } finally { await file?.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMarketingRoutes(process.argv.slice(2), process.env).then(report => {
    if (report.mode === 'dry-run') console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Report ${report.status}. ${report.counts.assessments}/4 assessments, ${report.counts.httpCalls}/12 HTTP calls. No fixture execution.`);
      if (report.status !== 'complete' || report.rows.some(row => !row.semanticSuccess)) process.exitCode = 1;
    }
  }).catch(() => { console.error('Marketing route verification refused or failed. No raw provider error is logged. Check flags, new output path and runtime key configuration.'); process.exitCode = 1; });
}
