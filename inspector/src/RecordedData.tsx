import type { InvocationView } from '../../src/inspector/view.js';
import RecordingDetails from './RecordingDetails.js';
import { pretty, ruleName } from './presentation.js';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const fieldNames: Record<string, string> = { path: 'Submitted path', file_path: 'Submitted file path', command: 'Submitted command', oldText: 'Submitted before text', newText: 'Submitted after text' };
const evidenceOrder = ['action', 'context', 'trajectory', 'policy', 'integrity'];
const evidenceNames: Record<string, string> = { action: 'Action and arguments', context: 'Host context', trajectory: 'Chronological history', policy: 'Submitted policy', integrity: 'Submitted integrity constraint' };

export default function RecordedData({ view }: { view: InvocationView }) {
  const action = object(object(view.evidence).action), args = object(action.arguments), fields = Object.entries(args);
  const editText = Object.hasOwn(args, 'oldText') || Object.hasOwn(args, 'newText');
  const evidenceEntries = Object.entries(object(view.evidence)).sort(([a], [b]) => {
    const rank = (key: string) => evidenceOrder.includes(key) ? evidenceOrder.indexOf(key) : evidenceOrder.length;
    return rank(a) - rank(b);
  });
  return <div className="recorded-data">
    <section className="record-group" aria-label="Submitted action">
      <h3>Submitted action</h3><p className="muted">These are recorded submitted arguments, not proof that the tool ran or changed a file. No current file is read.</p>
      {fields.length ? <>
        <dl className="submitted-fields">{fields.map(([key, value]) => <div key={key}><dt>{Object.hasOwn(fieldNames, key) ? fieldNames[key] : key}</dt><dd>
          {typeof value === 'string' ? <><pre className="submitted-string">{value}</pre>{value === '' && <p className="muted">Recorded empty string.</p>}</> : <><p className="muted">Recorded non-string value.</p><pre>{JSON.stringify(value, null, 2)}</pre></>}
        </dd></div>)}</dl>
        {editText && !Object.hasOwn(args, 'oldText') && <p className="missing-data">Submitted before text unavailable: not recorded.</p>}
        {editText && !Object.hasOwn(args, 'newText') && <p className="missing-data">Submitted after text unavailable: not recorded.</p>}
      </> : <p className="missing-data">Readable submitted arguments unavailable. Inspect the captured action below. No action is reconstructed.</p>}
      <details className="exact-action"><summary>Exact submitted action JSON</summary><pre>{pretty(object(view.evidence).action)}</pre></details>
    </section>
    <section className="record-group" aria-label="Captured policy">
      <h3>Captured policy</h3><p className="muted">Recorded policy at invocation time, not current policy.</p>
      {view.rules.filter(rule => !rule.builtin).map(rule => <div className="captured-rule" key={rule.id}><h4>{ruleName(rule)} · {rule.enforcement}</h4><pre className="submitted-string">{rule.text}</pre></div>)}
      {!view.rules.some(rule => !rule.builtin) && <p className="missing-data">Policy rule snapshot unavailable.</p>}
      <details className="exact-policy"><summary>Policy identity and exact JSON</summary><p className="muted">Captured source, target and digest, when recorded.</p><pre>{pretty(view.policy)}</pre></details>
    </section>
    <details className="record-group submitted-evidence-details"><summary>Exact submitted evidence</summary>
      <p className="muted">Shared by all rules. Redactions and omitted history remain as recorded. Strings may contain secrets. No hidden model reasoning is recorded.</p>
      <section className="submitted-evidence" aria-label="Submitted evidence" tabIndex={0}>
        {view.evidence === null ? <p className="missing-data">Submitted evidence unavailable. No historical payload is reconstructed.</p> : !evidenceEntries.length ? <pre>{pretty(view.evidence)}</pre> : evidenceEntries.map(([key, value]) =>
          <section className="evidence-section" key={key}><h4>{Object.hasOwn(evidenceNames, key) ? evidenceNames[key] : key}</h4><p className="question-key">state.{key}</p>
            {key === 'trajectory' && view.evidenceContext?.selectionVersion === 'bounded-history-v2' && value && typeof value === 'object' && 'values' in value ? <p className="muted">Exact references point to this snapshot's values pool. Literal escapes preserve authored lookalikes as untrusted data. Excerpts and omissions are separate losses. This is the recorded representation, not reconstructed history or proof of execution.</p> : null}
            <pre>{JSON.stringify(value, null, 2)}</pre>
          </section>)}
      </section>
    </details>
    <details className="record-group exact-rules"><summary>Exact rule records and captured questions</summary>
      <p className="muted">Retained rule records, mappings, question version and captured questions, not current policy or templates. Available independently of the application response.</p>
      <p className="muted">Missing data is not a pass. Non-applicable evidence has no evidence score. WARN is advisory; approval conditions are separate from permission and tool results.</p>
      <p className="muted">Model probabilities, not calibrated safety guarantees. No hidden model reasoning is recorded. HTML, links and images remain inert.</p>
      {!view.rules.length && <p className="missing-data">No retained rule records or questions available. No historical records are reconstructed.</p>}
      <section className="exact-rule-data" aria-label="Exact rule records and captured questions" tabIndex={0}><pre>{pretty({ questionVersion: view.questionVersion ?? null, rules: view.rules })}</pre></section>
    </details>
    <details className="record-group recorded-response"><summary>Application response and validation</summary>
      <section aria-label="Response"><h3>Application response</h3><p className="muted">Untrusted recorded SDK response. Credential and header fields are omitted; strings may still contain secrets.</p>
        {view.response?.unavailable ? <p>Response snapshot unavailable. The response could not be safely serialized within capture limits.</p> : view.response?.truncated ? <p>Response truncated. Preview limited to 1 MiB; serialized size after field omissions: {view.response.bytes} bytes.</p> : !view.response && <p>No application response recorded. This does not prove the provider returned nothing.</p>}
        {view.native && <details className="native-exchanges"><summary>Recorded native exchanges</summary>
          <p>Bounded, sanitized snapshots, not an unredacted wire log. Omitted fields stay omitted. Native strings can contain secrets.</p>
          {view.native.snapshots.map((snapshot, index) => <details key={index}><summary>Exchange {index + 1}</summary><pre>{pretty(snapshot)}</pre></details>)}
        </details>}
        <pre>{pretty(view.response)}</pre><h3>Validation</h3><pre>{pretty(view.validation)}</pre>
      </section>
    </details>
    <details className="record-group recording-details"><summary>Recording and coverage</summary>
      <RecordingDetails view={view} />
      <details className="exact-context"><summary>Exact runtime evidence context JSON</summary><p className="muted">Owner-only coverage diagnostic, separate from submitted evidence.</p><pre>{pretty(view.evidenceContext)}</pre></details>
    </details>
  </div>;
}
