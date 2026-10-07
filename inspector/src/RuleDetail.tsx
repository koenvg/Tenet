import { gateLabels, gateExplanation, gateTone, contributionExplanation, confidenceReadings, type RuleView } from './presentation.js';
import ConfidenceMeter from './ConfidenceMeter.js';
import StatusChip from './StatusChip.js';

export default function RuleDetail({ rule, mode }: { rule: RuleView; mode?: string }) {
  const readings = confidenceReadings(rule);
  return <section aria-label="Selected rule" className="rule-detail" tabIndex={0}>
    <div className="rule-detail-title"><h3>{rule.builtin ? 'Built-in integrity' : `Rule at line ${rule.line}`}</h3><span className="setting">{rule.enforcement}</span></div>
    {!rule.builtin && <p className="setting">Source role: {rule.origin?.role ?? 'unknown, not recorded'}{rule.origin?.source && ` | ${rule.origin.source}`}</p>}
    <p className="snapshot-text">{rule.text}</p>
    {rule.textStatus === 'truncated' && <p className="missing-data">Rule text truncated to 2,048 characters. {rule.omittedTextChars ?? 0} characters omitted.</p>}
    {rule.textStatus === 'missing' && <p className="missing-data">No rule text snapshot recorded. Missing text is not a pass.</p>}
    {rule.result?.outcome && <div className="rule-outcome">Rule outcome <StatusChip value={rule.result.outcome.choice ?? 'Unavailable'} /></div>}
    {rule.evidenceGate === 'not-applicable' && <p className="muted">Evidence-confidence gate does not apply. No evidence score was recorded.</p>}
    {(!!rule.gateIds?.length || rule.contribution.includes('approval')) && <p className="contribution">{contributionExplanation(rule, mode)}</p>}
    {rule.gateIds === null ? <p className="missing-data">Gate coverage unavailable: not recorded.</p>
      : !rule.gateIds.length ? <p className="muted">No gates recorded.</p>
      : <ul className="gate-list">{rule.gateIds.filter(gate => !readings.some(r => r.gate === gate)).map(gate => <li key={gate}><StatusChip value={gate} label={gateLabels[gate] ?? 'Unrecognized recorded gate'} tone={gateTone(rule, gate)} /><p>{gateExplanation(gate, rule)}</p></li>)}</ul>}
    {readings.map(reading => <ConfidenceMeter key={reading.gate} label={reading.label} value={reading.value} threshold={reading.threshold} />)}
    {rule.result?.outcome?.choice === 'PASS' && rule.gateIds?.some(g => g.includes('confidence') || g === 'evidence-insufficient') && <p className="confidence-note">PASS was selected for the rule outcome, but a confidence or evidence check did not pass. This is not a reported violation.</p>}
    <details className="rule-technical disclosure"><summary>Probabilities and rule details</summary>
      <p className="contribution">{contributionExplanation(rule, mode)}</p>
      <p className="setting">Enforcement: {rule.enforcement}</p>
      {rule.origin && <p className="setting">Recorded target: {rule.origin.target ?? 'not recorded'}<br />Source SHA-256: {rule.origin.digest ?? 'not recorded'}</p>}
      {!!rule.gateIds?.length && <details className="gate-details"><summary>Gate identifiers</summary><ul>{rule.gateIds.map(gate => <li key={gate}><code>{gate}</code></li>)}</ul></details>}
      <div className="distributions">{(['outcome', 'evidence'] as const).map(kind => {
        const entries = Object.entries(rule.result?.[kind]?.probabilities ?? {});
        return <table key={kind}>
          <caption>{kind === 'outcome' ? 'Outcome' : 'Evidence sufficiency'}</caption>
          <thead><tr><th scope="col">Label</th><th scope="col">Probability</th></tr></thead>
          <tbody>{entries.length ? entries.map(([label, probability]) => <tr key={label} className={label === rule.result?.[kind]?.choice ? 'selected-label' : ''}>
            <th scope="row">{label === rule.result?.[kind]?.choice ? <><StatusChip value={label} /><small>selected</small></> : label}</th><td>{String(probability)}</td>
          </tr>) : <tr><td colSpan={2}>{kind === 'evidence' && rule.evidenceGate === 'not-applicable' ? 'Not applicable. No evidence score.' : 'Assessment unavailable.'}</td></tr>}</tbody>
          <tfoot><tr><th scope="row">{kind === 'outcome' ? 'Selected outcome threshold' : 'SUFFICIENT threshold'}</th><td>{kind === 'outcome' ? rule.thresholds.effectThreshold ?? 'Not recorded' : rule.evidenceGate === 'not-applicable' ? 'Not applicable' : rule.thresholds.evidenceThreshold ?? 'Not recorded'}</td></tr></tfoot>
        </table>;
      })}</div>
      <p className="muted probability-note">Model probabilities, not calibrated safety guarantees. No hidden model reasoning is recorded.</p>
    </details>
  </section>;
}
