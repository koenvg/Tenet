import type { Capabilities } from '../runtime/guard.js';
import type { Capability, GuardOptions } from './types.js';

const supported: readonly Capability[] = [
  'interception', 'result-correlation', 'lifecycle-invalidation', 'argument-stability', 'trusted-approval',
];
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;

/** Translate explicit host guarantees once. Callbacks and tool names never add coverage. */
export function declaredCapabilities(options: GuardOptions): Capabilities {
  if (!text(options.host)) throw new Error('invalid-host');
  const capabilities = options.capabilities === undefined ? [] : options.capabilities;
  if (!Array.isArray(capabilities) || capabilities.length > supported.length
    || [...capabilities].some(value => !supported.includes(value)) || new Set(capabilities).size !== capabilities.length)
    throw new Error('invalid-capabilities');
  if (options.hostVersion !== undefined && !text(options.hostVersion)
    || options.hostProfile !== undefined && !text(options.hostProfile)) throw new Error('invalid-host-metadata');
  const limitations = options.limitations === undefined ? [] : options.limitations;
  if (!Array.isArray(limitations) || limitations.length > 64 || [...limitations].some(value => !text(value))) throw new Error('invalid-limitations');
  return {
    host: options.host, version: options.hostVersion ?? null, profile: options.hostProfile ?? null,
    interception: capabilities.includes('interception'), resultCorrelation: capabilities.includes('result-correlation'),
    lifecycleInvalidation: capabilities.includes('lifecycle-invalidation'), argumentStability: capabilities.includes('argument-stability'),
    trustedApproval: capabilities.includes('trusted-approval'), limitations: [...limitations],
  };
}
