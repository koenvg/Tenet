import { POLICY_LIMITS } from '../decision/policy.js';

/** Private recorded display metadata, never a resolved target or proof of execution. */
export type TextPreview = { value: string | null; shortened: boolean };
export type ActionPreview = { key: 'command' | 'path' | 'file_path'; value: string; shortened: boolean }
  | { key: null; value: null; shortened: false };
export const unavailableActionPreview: ActionPreview = { key: null, value: null, shortened: false };
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Normalize only this bounded display copy. Exact records remain in selected detail. */
function recordedTextPreview(text: unknown): TextPreview {
  if (typeof text !== 'string') return { value: null, shortened: false };
  const display = text.replace(/\s+/gu, ' ').trim();
  if (!display) return { value: null, shortened: false };
  let value = '', bytes = 0;
  for (const character of display) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > 512) return { value, shortened: true };
    value += character; bytes += size;
  }
  return { value, shortened: false };
}

export function recordedActionPreview(payload: unknown): ActionPreview {
  const args = object(object(object(object(payload).state).action).arguments);
  for (const key of ['command', 'path', 'file_path'] as const) {
    const preview = recordedTextPreview(args[key]);
    if (preview.value !== null) return { key, value: preview.value, shortened: preview.shortened };
  }
  return unavailableActionPreview;
}

/** Only the supported policy-rule count plus one integrity excerpt survives parsing. */
export function recordedRulePreviews(data: Record<string, unknown>, stage: string): { id: string; preview: TextPreview }[] | undefined {
  if (stage !== 'begin' && stage !== 'request') return undefined;
  const policy = object(data.policy);
  const state = object(object(data.payload).state);
  const integrity = object(stage === 'begin' ? data.integrity : state.integrity);
  const rules = Array.isArray(policy.rules) ? policy.rules.slice(0, POLICY_LIMITS.rules) : [];
  return [...rules, ...(typeof integrity.id === 'string' ? [integrity] : [])].flatMap(value => {
    const rule = object(value);
    if (typeof rule.id !== 'string' || rule.id.length > 256) return [];
    return [{ id: rule.id, preview: recordedTextPreview(rule.text) }];
  });
}
