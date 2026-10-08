export default function RecordedConfidence({ label, value, threshold, belowRequired = false, scoreLabel = 'Recorded', selectedChoice, selectedValue }: {
  label: string; value?: number | null; threshold?: number | null; belowRequired?: boolean; scoreLabel?: string;
  selectedChoice?: string | null; selectedValue?: number | null;
}) {
  const known = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    && typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
  return <div className={`confidence-reading ${belowRequired ? 'low-confidence' : ''}`}>
    <div className="confidence-label"><strong>{label}</strong>{belowRequired && <span>Below required confidence · uncertain</span>}</div>
    {known && <div className="confidence-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={value!} aria-valuetext={`${scoreLabel} ${value}; required confidence ${threshold}`}>
      <span className="confidence-fill" style={{ width: `${value! * 100}%` }} /><span className="confidence-threshold" style={{ left: `${threshold! * 100}%` }} />
    </div>}
    <div className="confidence-values"><span>{scoreLabel} <strong>{value ?? 'Unknown / not recorded'}</strong></span><span>Required <strong>{threshold ?? 'Unknown / not recorded'}</strong></span></div>
    {selectedChoice !== undefined && selectedChoice !== scoreLabel && <p className="selected-evidence-confidence">Selected {selectedChoice ?? 'Unavailable'} confidence: <strong>{selectedValue ?? 'Unknown / not recorded'}</strong></p>}
  </div>;
}
