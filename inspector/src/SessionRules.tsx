import type { RuleInventory } from '../../src/inspector/session-rules-model.js';
export { RuleIcon, RuleStatusLabel } from './shared/RuleStatus.js';
export function inventoryNote(inventory: RuleInventory) {
  return inventory.state === 'known' ? `${inventory.unchecked} ${inventory.unchecked === 1 ? 'rule' : 'rules'} not checked` : 'Rule inventory unknown';
}
export const projectName = (paths: string[]) => paths.map(p => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p).join(', ') || 'Unknown project';
export const recordedTime = (value: number) => new Date(value).toLocaleString();
