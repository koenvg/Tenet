import { FixtureArchiveWriter } from './archive-fixture.js';

export const distribution = (selected: string, labels: string[]) => ({ choice: selected,
  probabilities: Object.fromEntries(labels.map(label => [label, label === selected ? 1 : 0])) });
export function ruleResult(id: string, outcome = 'PASS', profile = 'legacy') {
  return { ruleId: id, outcome: distribution(outcome, ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED',
    ...(profile === 'applicability-v1' && id !== 'historical-integrity' ? ['NOT_APPLICABLE'] : [])]),
  evidence: outcome === 'NOT_APPLICABLE' ? null : distribution('SUFFICIENT', ['SUFFICIENT', 'INSUFFICIENT']),
  ...(outcome === 'NOT_APPLICABLE' ? { factReferences: { digest: 'recorded-reference', operationIds: ['operation-1'] }, applicabilitySupported: true } : {}) };
}
export function ruleRecording(options: { outcome?: string; profile?: string; question?: string; version?: string; rules?: number } = {}): Record<string, any> {
  const profile = options.profile ?? 'legacy';
  const declarations = Array.from({ length: options.rules ?? 1 }, (_, n) => ({ id: n === 0 ? 'r' : `r${n}`,
    text: 'Only synthetic actions. <script>inert()</script>', enforcement: 'WARN', line: n + 1 }));
  return { begin: { policy: { source: '/synthetic/TENET.md', digest: options.version ?? 'version-a', rules: declarations },
    integrity: { id: 'historical-integrity', text: 'Protect the recorded policy.' }, profile,
    ...(options.question ? { questionVersion: options.question } : {}) },
  validation: { valid: true }, assessment: { assessment: { model: 'offline', profile,
    rules: [...declarations.map(rule => ruleResult(rule.id, options.outcome, profile)), ruleResult('historical-integrity', 'PASS', profile)] } },
  decision: { decision: 'ALLOW', contributions: [...declarations.map(rule => ({ ruleId: rule.id, gates: [] })), { ruleId: 'historical-integrity', gates: [] }] } };
}
export function writeRuleRecording(writer: FixtureArchiveWriter, session: string, invocation: string, data: Record<string, any>) {
  const sink = writer.bindHistorical({ sessionId: session, invocationId: invocation, callId: invocation, toolName: 'edit', cwd: '/synthetic', mode: 'observe' }, 1);
  for (const [stage, value] of Object.entries(data)) if (value !== undefined) sink(stage as any, value);
  return sink;
}
export async function refreshRules(index: { refresh(): Promise<void>; indexing: boolean }, ready = () => true) {
  for (let n = 0; n < 200; n++) { await index.refresh(); if (!index.indexing && ready()) return; }
  throw new Error('synthetic-index-did-not-settle');
}
