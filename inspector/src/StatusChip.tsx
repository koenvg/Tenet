import { Badge } from '../../web/components/ui/badge.js';
import { tone as valueTone, type StatusTone, type StatusIcon } from './presentation.js';
import DecisionIcon from './DecisionIcon.js';

export default function StatusChip({ value, label, showIcon = false, tone, icon }: {
  value: string; label?: string; showIcon?: boolean; tone?: StatusTone; icon?: StatusIcon;
}) {
  const chipTone = tone ?? valueTone(value);
  return <Badge variant="outline" className={`status-chip ${chipTone}${showIcon ? ' with-icon' : ''}`}>
    {showIcon && <DecisionIcon kind={icon ?? (chipTone === 'positive' ? 'allow' : chipTone === 'danger' ? 'block' : chipTone === 'approval' ? 'ask' : 'unknown')} />}
    <span>{label ?? value}</span>
  </Badge>;
}
