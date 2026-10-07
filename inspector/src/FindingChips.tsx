import type { FindingCategory } from '../../src/decision/finding-triage.js';
import { findingPresentation } from './presentation.js';
import StatusChip from './StatusChip.js';

export default function FindingChips({ categories }: { categories: FindingCategory[] }) {
  return <span className="finding-chips" aria-label="Recorded findings">{categories.map(category => {
    const finding = findingPresentation(category);
    return <StatusChip key={category} value={category} label={finding.label} tone={finding.tone} icon={finding.icon} showIcon />;
  })}</span>;
}
