export default function ConfidenceMeter({ label, value, threshold }: { label: string; value: number; threshold: number }) {
  return <div className="confidence-reading">
    <div className="confidence-label"><strong>{label}</strong><span>Below required confidence</span></div>
    <div className="confidence-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} aria-valuetext={`${value}; required confidence ${threshold}`}>
      <span className="confidence-fill" style={{ width: `${value * 100}%` }} />
      <span className="confidence-threshold" style={{ left: `${threshold * 100}%` }} />
    </div>
    <div className="confidence-values"><span>Recorded <strong>{String(value)}</strong></span><span>Required <strong>{String(threshold)}</strong></span></div>
  </div>;
}
