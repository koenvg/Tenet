import type { InvocationView } from '../../src/inspector/view.js';
import { gateLabels, gateExplanation, gateTone } from './presentation.js';
import StatusChip from './StatusChip.js';
import RecordedConfidence from './RecordedConfidence.js';

export default function RecordedRule({ rule, mode }: { rule: InvocationView['rules'][number]; mode?: string }) {
  const otherGates = rule.gateIds?.filter(gate => !['outcome-confidence-below-threshold', 'evidence-confidence-below-threshold'].includes(gate)) ?? [];
  return <section aria-label="Recorded rule" className="rule-detail" data-rule-id={rule.id}>
    <h3 className="snapshot-text">{rule.text}</h3>
    {rule.builtin && <p className="builtin-label">Built-in integrity</p>}
    {rule.result?.outcome?.choice === 'UNKNOWN' && <p className="missing-data">Unknown does not mean passed.</p>}
    {((rule.enforcement === 'WARN' && !!rule.gateIds?.length) || rule.contribution === 'advisory-gates') && <p className="contribution">Recorded advisory gates. WARN does not block.</p>}
    {rule.contribution === 'approval-required' ? <p className="contribution">{mode === 'observe' ? 'Approval condition. Approval was not requested in observe mode.' : 'Requires approval. Another rule may still block the invocation.'}</p>
      : rule.contribution === 'advisory-approval' && <p className="contribution">Advisory approval requirement. WARN does not request confirmation.</p>}
    {rule.gateIds === null ? <p className="missing-data">Gate coverage unavailable: not recorded.</p> : !rule.gateIds.length && <p className="muted">No gates recorded.</p>}
    {!!otherGates.length && <ul className="gate-list">{otherGates.map(gate => <li key={gate}><StatusChip value={gate} label={gateLabels[gate] ?? 'Unrecognized recorded gate'} tone={gateTone(rule, gate)} /><p>{gateExplanation(gate, rule)}</p></li>)}</ul>}
    <RecordedConfidence label="Outcome confidence" scoreLabel={rule.result?.outcome?.choice ?? 'Outcome unavailable'} value={rule.result?.outcome?.probabilities?.[rule.result.outcome.choice]} threshold={rule.thresholds.effectThreshold} belowRequired={rule.gateIds?.includes('outcome-confidence-below-threshold') ?? false} />
    {rule.evidenceGate === 'not-applicable' ? <p className="muted">Evidence-confidence gate does not apply. No evidence score was recorded.</p>
      : <RecordedConfidence label="Evidence confidence" scoreLabel="SUFFICIENT" value={rule.result?.evidence?.probabilities?.SUFFICIENT} threshold={rule.thresholds.evidenceThreshold} selectedChoice={rule.result?.evidence?.choice ?? null} selectedValue={rule.result?.evidence?.choice ? rule.result.evidence.probabilities?.[rule.result.evidence.choice] : null} belowRequired={rule.gateIds?.includes('evidence-confidence-below-threshold') ?? false} />}
  </section>;
}
