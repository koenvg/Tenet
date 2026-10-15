import { ruleStatusPresentation, type RuleStatus, type RuleInventory } from '../../src/inspector/session-rules-model.js';

export function RuleIcon({ kind, className = '' }: { kind: RuleStatus | 'chevron' | 'close' | 'brand'; className?: string }) {
  const paths = { clear: <path d="m5 12 4 4L19 6" />, violation: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>, unclear: <><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5M12 18h.01" /></>, unchecked: <><circle cx="12" cy="12" r="8" /><path d="M9 12h6" /></>, chevron: <path d="m9 5 7 7-7 7" />, close: <path d="m6 6 12 12M18 6 6 18" />, brand: <path d="M4 5h16M12 5v15M7 9v8M17 9v8M5 20h14" /> };
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{paths[kind]}</svg>;
}
export function RuleStatusLabel({ status }: { status: RuleStatus }) {
  return <span className="rule-status" data-state={status}><RuleIcon kind={status} />{ruleStatusPresentation[status].label}</span>;
}
export function inventoryNote(inventory: RuleInventory) {
  return inventory.state === 'known' ? `${inventory.unchecked} ${inventory.unchecked === 1 ? 'rule' : 'rules'} not checked` : 'Rule inventory unknown';
}
export const projectName = (paths: string[]) => paths.map(p => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p).join(', ') || 'Unknown project';
export const recordedTime = (value: number) => new Date(value).toLocaleString();
