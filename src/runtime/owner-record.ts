import { freeze } from '../decision/evidence.js';
import type { OwnerRecord } from '../sdk/types.js';
import type { Mode } from './config.js';

const stages: readonly OwnerRecord['stage'][] = ['status', 'assessment', 'decision', 'approval', 'permission', 'assessment-status', 'execution'];
/** Bounded runtime records only. No request, response or agent-visible delivery. */
export function deliverOwnerRecord(listener: ((record: OwnerRecord) => void) | undefined,
  stage: string, data: Record<string, unknown>, mode: Mode): void {
  if (!listener) return;
  const ownerStage = stages.find(item => item === stage);
  try {
    if (ownerStage) listener(freeze(structuredClone({ stage: ownerStage, data: { ...data, mode } })));
  } catch { /* Best-effort owner delivery cannot affect permission or archive capture. */ }
}
