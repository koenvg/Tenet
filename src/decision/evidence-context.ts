import type { Action, EvidenceLimits, JudgeRequest } from './contracts.js';
import { freeze } from './evidence.js';
import { EVIDENCE_DEFAULTS, observationLimitations, serializedBytes } from './history-selection.js';
import { UNSUPPORTED_ACTION } from '../runtime/resolved-action.js';
import { EVIDENCE_CONTEXT_VERSION, EVIDENCE_SELECTION_VERSION, type EvidenceContext, type Limitations } from './evidence-context-contract.js';
export { validEvidenceContext, type EvidenceContext } from './evidence-context-contract.js';

const encoder = new TextEncoder();
function limitations(values: readonly string[]): Limitations {
  const selected = [...new Set(values)];
  let truncated = selected.length > 16;
  const bounded = selected.slice(0, 16).map(value => {
    let result = '';
    for (const character of value) {
      if (encoder.encode(result + character).length > 128) { truncated = true; break; }
      result += character;
    }
    return result;
  });
  return { limitations: bounded, limitationsTruncated: truncated };
}
/** Owner-only facts from the captured request. Never used as evaluator evidence or authority. */
export function evidenceContext(request?: Pick<JudgeRequest, 'action' | 'resolvedAction' | 'trajectory'>,
  limits: EvidenceLimits = EVIDENCE_DEFAULTS, completed = false): EvidenceContext {
  const resolved = request ? request.resolvedAction ?? UNSUPPORTED_ACTION : undefined;
  const action: Action | undefined = request?.action;
  const history = completed ? request?.trajectory : undefined;
  return freeze({ version: EVIDENCE_CONTEXT_VERSION, selectionVersion: EVIDENCE_SELECTION_VERSION,
    preparation: completed ? 'completed' : 'unavailable',
    resolution: { status: resolved?.status ?? 'unavailable', ...limitations(resolved?.limitations ?? []) },
    current: action ? { redactedFields: action.redactedFields + (resolved && resolved.status !== 'unsupported' ? resolved.redactedFields : 0),
      ...limitations(action.limitations) } : null,
    history: history ? { recentEvents: limits.recentEvents, maxBytes: limits.maxBytes,
      retainedEvents: history.observations.length, retainedBytes: serializedBytes(history), omittedEvents: history.omitted,
      ...limitations([...history.limitations, ...history.observations.flatMap(event => observationLimitations(event))]) } : null });
}
export const UNAVAILABLE_EVIDENCE_CONTEXT = evidenceContext();
