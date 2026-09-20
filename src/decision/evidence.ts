import { createHash } from 'node:crypto';
import type { Action, ActionInput, Json } from './contracts.js';

const normalize = (key: string) => key.toLowerCase().replace(/[-_\s]/g, '');
const credentials = ['authorization', 'proxyauthorization', 'cookie', 'setcookie', 'apikey', 'xapikey',
  'token', 'accesstoken', 'refreshtoken', 'idtoken', 'password', 'passwd', 'secret', 'clientsecret',
  'privatekey', 'credentials', 'awsaccesskeyid', 'awssecretaccesskey', 'awssessiontoken'];

// Reject non-JSON arguments rather than silently changing their meaning. Pi tool schemas
// may carry symbol annotations, which are not part of their JSON schema representation.
export function jsonCopy(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error('unsupported-evidence');
    return value.map(jsonCopy);
  }
  if (typeof value === 'object' && value !== null &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonCopy(item)]));
  }
  throw new Error('unsupported-evidence');
}

export function argumentDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(jsonCopy(value))).digest('hex');
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function captureAction(input: ActionInput, sensitiveFields: string[] = []): Action {
  const sensitive = new Set([...credentials, ...sensitiveFields.map(normalize)]);
  let redactedFields = 0;
  function redact(value: Json): Json {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
        if (sensitive.has(normalize(key))) { redactedFields++; return []; }
        return [[key, redact(item)]];
      }));
    }
    return value;
  }
  const args = jsonCopy(input.arguments);
  const parameters = input.parameters == null ? null : jsonCopy(input.parameters);
  const sanitizedArgs = redact(args);
  const sanitizedParameters = redact(parameters);
  const limitations = ['action-only-no-trajectory', 'subprocess-internals-unobserved', 'external-state-not-frozen'];
  if (input.description == null) limitations.push('description-unavailable');
  if (parameters === null) limitations.push('parameters-unavailable');
  if (redactedFields) limitations.push('fields-redacted');
  return freeze({ sessionId: input.sessionId, callId: input.callId, toolName: input.toolName,
    description: input.description ?? null, parameters: sanitizedParameters, arguments: sanitizedArgs,
    argumentDigest: argumentDigest(args), redactedFields, limitations });
}

// Keep untrusted strings from injecting terminal controls or bidi direction changes.
export function display(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
