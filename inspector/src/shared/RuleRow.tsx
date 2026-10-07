import type { SummaryRule } from './model.js';
import { ruleName, gateLabels } from '../presentation.js';
import { Button } from '../../../web/components/ui/button.js';
import StatusChip from '../StatusChip.js';
export default function RuleRow({ rule, selected, select }: { rule: SummaryRule; selected: boolean; select(): void }) {
  return <Button variant="ghost" className="rule-row" aria-pressed={selected} onClick={select}>
    <span className="rule-row-top"><strong>{ruleName(rule)}</strong><StatusChip value={rule.result?.outcome?.choice ?? 'Unavailable'} /></span>
    <span className="rule-text">{rule.text}</span>
    {(!!rule.gateIds?.length || rule.contribution.includes('approval') || rule.gateIds === null) && <span className="rule-finding">{rule.gateIds?.length ? rule.gateIds.map(g => gateLabels[g] ?? g).join(' · ') : rule.contribution.includes('approval') ? 'Approval requirement' : 'Gates not recorded'}</span>}
  </Button>;
}
