const readingText = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? String(value) : value == null ? 'Unknown / not recorded' : 'Unavailable (malformed recording)';
const choiceText = (value: unknown) => typeof value === 'string'
  ? value : value == null ? 'Unavailable' : 'Unavailable (malformed recording)';

export default function RecordedConfidence({ label, value, threshold, belowRequired = false, scoreLabel = 'Recorded', selectedChoice, selectedValue }: {
  label: string; value?: unknown; threshold?: unknown; belowRequired?: boolean; scoreLabel?: unknown;
  selectedChoice?: unknown; selectedValue?: unknown;
}) {
  const known = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    && typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
  return <div className={`confidence-reading ${belowRequired ? 'low-confidence' : ''}`}>
    <div className="confidence-label"><strong>{label}</strong>{belowRequired && <span>Below required confidence · uncertain</span>}</div>
    {known && <div className="confidence-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={value!} aria-valuetext={`${choiceText(scoreLabel)} ${value}; required confidence ${threshold}`}>
      <span className="confidence-fill" style={{ width: `${value! * 100}%` }} /><span className="confidence-threshold" style={{ left: `${threshold! * 100}%` }} />
    </div>}
    <div className="confidence-values"><span>{choiceText(scoreLabel)} <strong>{readingText(value)}</strong></span><span>Required <strong>{readingText(threshold)}</strong></span></div>
    {selectedChoice !== undefined && selectedChoice !== scoreLabel && <p className="selected-evidence-confidence">Selected {choiceText(selectedChoice)} confidence: <strong>{readingText(selectedValue)}</strong></p>}
  </div>;
}
