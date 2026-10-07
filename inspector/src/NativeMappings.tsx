import type { InvocationView } from '../../src/inspector/view.js';

export default function NativeMappings({ native }: { native: NonNullable<InvocationView['native']> }) {
  return <details className="record-note native-mappings"><summary>Native scoring mappings</summary>
    <p>Recorded requests only. Missing exchanges are unknown, not successful scores.</p>
    <p>{native.requests.length} scoring requests; {native.responses.length} captured responses; {native.omissions.length} unavailable or truncated snapshots.</p>
    {native.failureCategory && <p>Native failure category: {String(native.failureCategory)}</p>}
    {native.deterministic.map((answer, index) => <p key={index}>{answer.question}: deterministic NONE. One allowed candidate; no model scoring request. Not model confidence or authenticated coverage.</p>)}
    {native.requests.map((request, index) => <div className="native-question" key={index}>
      <h4>{request.question}</h4>
      <p>Prompt tokens: {request.nativeRequest?.prompt?.length ?? 'not recorded'}; context capacity: {request.contextCapacity ?? 'not recorded'}; shared prefix tokens: {request.sharedPrefixTokens ?? 'not recorded'}.</p>
      <ul>{Object.entries(request.mapping ?? {}).map(([label, id]) => <li key={label}>{label} → {String(id)}; token ID {request.labelIds?.[label] ?? 'not recorded'}</li>)}</ul>
    </div>)}
    <p>Cache and timing counters do not prove coverage, label matching or calibration. A backend alias does not prove physical weights.</p>
  </details>;
}
