import type { Json } from '../decision/contracts.js';
import { argumentDigest, captureAction, freeze, jsonCopy } from '../decision/evidence.js';
import { evidenceWithinBudget } from '../decision/evidence-budget.js';

export interface ActionBinding {
  host: string; sessionId: string; contextId: string; invocationId: string;
  callId: string; toolName: string; argumentDigest: string; cwd: string;
}
export type OperationSemantics = 'file-edit' | 'file-read' | 'remove' | 'move' | 'execute' | 'opaque';
export interface ActionFacts {
  version: 1;
  binding: ActionBinding;
  integration: { id: string; version: string };
  resolverState: string;
  coverage: 'complete' | 'partial';
  operations: {
    id: string;
    semantics: OperationSemantics;
    resources: { requested: string; resolved: string; identity: string; relation: 'direct' | 'link' | 'ancestor' }[];
    content: { role: 'literal' | 'executed'; value: Json }[];
    before?: Json;
    after?: Json;
  }[];
  limitations: string[];
}
export type ResolvedAction =
  | { status: 'unsupported'; limitations: readonly string[] }
  | { status: 'authenticated-complete' | 'authenticated-partial'; facts: ActionFacts; redactedFields: number; limitations: readonly string[] };

/** Trusted embedding configuration, never deserialized from an agent or hook payload.
 * The executor must pin the checked operation through dispatch, or reject it itself.
 * Callbacks must be local, bounded and cancellation-aware. See docs/action-resolution.md.
 */
export interface ActionResolver {
  id: string;
  version: string;
  semantics: readonly OperationSemantics[];
  resolve(request: { binding: ActionBinding; input: Json }, signal: AbortSignal): Promise<ActionFacts | null>;
  revalidate(request: { binding: ActionBinding; facts: ActionFacts }, signal: AbortSignal): Promise<ActionFacts | null>;
}
export const UNSUPPORTED_ACTION: ResolvedAction = freeze({ status: 'unsupported', limitations: ['target-resolution-unavailable', 'effects-unresolved'] });
export const RESOLUTION_MAX_BYTES = 16 * 1024;
export const RESOLUTION_TIMEOUT_MS = 100;
const semantics: readonly string[] = ['file-edit', 'file-read', 'remove', 'move', 'execute', 'opaque'];
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 4096;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 64 && v.every(text);
const equal = (a: unknown, b: unknown) => argumentDigest(a) === argumentDigest(b);

function validated(raw: unknown, binding: ActionBinding, adapter: ActionResolver): ActionFacts {
  if (!evidenceWithinBudget([raw], RESOLUTION_MAX_BYTES)) throw new Error('action-resolution-capacity');
  const v = jsonCopy(raw);
  if (!object(v) || !keys(v, ['version', 'binding', 'integration', 'resolverState', 'coverage', 'operations', 'limitations'])
    || v.version !== 1 || !equal(v.binding, binding) || !equal(v.integration, { id: adapter.id, version: adapter.version })
    || !text(v.resolverState) || !['complete', 'partial'].includes(v.coverage as string)
    || !strings(v.limitations) || !Array.isArray(v.operations) || !v.operations.length || v.operations.length > 64) throw new Error('invalid-action-resolution');
  const ids = new Set<string>();
  for (const op of v.operations) {
    if (!object(op) || !keys(op, ['id', 'semantics', 'resources', 'content', 'before', 'after']) || !text(op.id) || ids.has(op.id)
      || !semantics.includes(op.semantics as string) || !Array.isArray(op.resources) || op.resources.length > 64
      || !Array.isArray(op.content) || op.content.length > 64) throw new Error('invalid-action-resolution');
    ids.add(op.id);
    for (const r of op.resources) {
      if (!object(r) || !keys(r, ['requested', 'resolved', 'identity', 'relation']) || !text(r.requested) || !text(r.resolved)
        || !text(r.identity) || !['direct', 'link', 'ancestor'].includes(r.relation as string)) throw new Error('invalid-action-resolution');
    }
    for (const c of op.content) {
      if (!object(c) || !keys(c, ['role', 'value']) || !['literal', 'executed'].includes(c.role as string)
        || !Object.hasOwn(c, 'value')) throw new Error('invalid-action-resolution');
    }
  }
  return freeze(v as unknown as ActionFacts);
}

// Time out even when an embedding forgets to settle its promise. The callback still
// owns cleanup and must not execute the action or retain locks after cancellation.
async function bounded<T>(signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const timeout = new AbortController();
  const combined = AbortSignal.any([signal, timeout.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  try {
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => reject(new Error('action-resolution-cancelled'));
      combined.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => timeout.abort(), RESOLUTION_TIMEOUT_MS);
    });
    if (combined.aborted) throw new Error('action-resolution-cancelled');
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      if (combined.aborted) throw new Error('action-resolution-cancelled');
      return work(combined);
    })]);
  } finally {
    clearTimeout(timer);
    combined.removeEventListener('abort', cancel);
  }
}

export interface ResolvedInvocation {
  evidence: ResolvedAction;
  revalidate(signal: AbortSignal): Promise<boolean>;
}

/** Copies the registration once. A mutable tool description cannot select a resolver. */
export class ActionResolution {
  private readonly adapter?: ActionResolver;
  constructor(adapter?: ActionResolver) {
    if (!adapter) return;
    if (!text(adapter.id) || !text(adapter.version) || !strings(adapter.semantics) || !adapter.semantics.length
      || !adapter.semantics.every(s => semantics.includes(s)) || typeof adapter.resolve !== 'function' || typeof adapter.revalidate !== 'function')
      throw new Error('invalid-action-resolver-registration');
    this.adapter = Object.freeze({ id: adapter.id, version: adapter.version, semantics: Object.freeze([...adapter.semantics]),
      resolve: adapter.resolve.bind(adapter), revalidate: adapter.revalidate.bind(adapter) });
  }
  get supported(): boolean { return !!this.adapter; }

  async capture(binding: ActionBinding, input: unknown, sensitiveFields: string[], signal: AbortSignal): Promise<ResolvedInvocation> {
    const adapter = this.adapter;
    const unsupported = { evidence: UNSUPPORTED_ACTION, revalidate: async () => true };
    if (!adapter) return unsupported;
    if (argumentDigest(input) !== binding.argumentDigest) throw new Error('action-resolution-arguments-changed');
    const bound = freeze({ ...binding });
    const raw = await bounded(signal, s => adapter.resolve({ binding: bound, input: freeze(jsonCopy(input)) }, s));
    if (raw === null) return unsupported;
    const facts = validated(raw, bound, adapter);
    const sanitized = captureAction({ sessionId: bound.sessionId, callId: bound.callId, toolName: bound.toolName, arguments: facts }, sensitiveFields);
    // Custom redaction may remove structural fields. Such facts cannot describe a
    // supported operation; never publish a malformed authenticated shape.
    const safe = validated(sanitized.arguments, bound, adapter);
    const limitations = [...safe.limitations];
    if (sanitized.redactedFields) limitations.push('fields-redacted');
    for (const op of safe.operations) {
      if (!adapter.semantics.includes(op.semantics)) limitations.push('unsupported-operation-semantics');
      if (op.semantics === 'execute' || op.semantics === 'opaque' || op.content.some(c => c.role === 'executed')) limitations.push('effects-unresolved');
      if (!op.resources.length) limitations.push('resources-unresolved');
      if (op.semantics === 'file-edit' && (!Object.hasOwn(op, 'before') || !Object.hasOwn(op, 'after'))) limitations.push('edit-content-unresolved');
    }
    if (safe.coverage === 'partial') limitations.push('partial-effect-coverage');
    const partial = limitations.length > 0;
    const evidence: ResolvedAction = freeze({ status: partial ? 'authenticated-partial' : 'authenticated-complete',
      facts: { ...safe, coverage: partial ? 'partial' : 'complete' }, redactedFields: sanitized.redactedFields, limitations: [...new Set(limitations)] });
    return { evidence, revalidate: async s => {
      try {
        const latest = await bounded(s, inner => adapter.revalidate({ binding: bound, facts }, inner));
        return latest !== null && equal(validated(latest, bound, adapter), facts);
      } catch { return false; }
    } };
  }
}
