import type { ArchiveRecord } from './contract.js';

// These are historical reader contracts. Do not replace them with current adapter settings.
const APUS_V1 = {
  version: 'apus-recording-v1', renderingVersion: 'jev.dynamic.prompt.v2',
  rendererRevision: '7389d774472c9e29ddc84fffb392951f0f25de74', protocolVersion: 'llamacpp-b11118-choice-v1',
} as const;
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const token = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export function validNativeContract(v: unknown): v is typeof APUS_V1 {
  return object(v) && Object.keys(v).length === 4 && Object.entries(APUS_V1).every(([k, expected]) => v[k] === expected);
}
/** Validate diagnostic mapping, not native model output. Invalid output must remain readable. */
export function validNativeCapture(stage: string, d: Record<string, unknown>): boolean {
  if (d.nativeContract === undefined) return true;
  if (!validNativeContract(d.nativeContract)) return false;
  if (stage === 'request') return d.provider === 'apus-llamacpp' && text(d.requestedModel)
    && object(d.payload) && d.payload.model === d.requestedModel
    && d.renderingVersion === APUS_V1.renderingVersion && d.rendererRevision === APUS_V1.rendererRevision;
  if (stage === 'validation') return typeof d.valid === 'boolean';
  if (stage !== 'response' || d.untrusted !== true) return false;
  // A bounded omission is not a mapping or an answer. Keep its markers, never infer it.
  if (d.truncated === true || d.unavailable === true) return true;
  const v = d.value;
  if (!object(v) || v.provider !== 'apus-llamacpp') return false;
  if (v.derivation === 'sole-allowed-facts-selector') return text(v.question)
    && v.modelConfidence === false && v.authenticatedCoverage === false && v.nativeScoringRequests === 0
    && Array.isArray(v.criteria) && v.criteria.length === 1 && v.criteria[0]?.id === 'NONE'
    && object(v.answer) && v.answer.choice === 'NONE' && object(v.answer.probabilities)
    && Object.keys(v.answer.probabilities).length === 1 && v.answer.probabilities.NONE === 1;
  if (v.kind === 'metadata') return ['before', 'after'].includes(v.phase) && object(v.identity) && text(v.identity.model);
  if (v.kind === 'native-response') return text(v.question) && Object.hasOwn(v, 'raw');
  if (v.kind !== 'native-request' || !text(v.question) || v.renderingVersion !== APUS_V1.renderingVersion
    || typeof v.chat !== 'string' || !object(v.mapping) || !object(v.labelIds) || !object(v.nativeRequest)) return false;
  const labels = Object.keys(v.mapping);
  return labels.length >= 2 && labels.length <= 16
    && labels.every((label, i) => label === String.fromCharCode(65 + i) && text(v.mapping[label]) && token(v.labelIds[label]))
    && new Set(Object.values(v.mapping)).size === labels.length
    && Object.keys(v.labelIds).length === labels.length
    && new Set(Object.values(v.labelIds)).size === labels.length
    && Array.isArray(v.nativeRequest.prompt) && v.nativeRequest.prompt.length > 0 && v.nativeRequest.prompt.every(token);
}

/** Read only recorded fields. A known report version records APUS experimental status. */
export function recordedJudge(records: ArchiveRecord[]) {
  const latest = (key: string) => [...records].reverse().find(r => Object.hasOwn(r.data, key))?.data[key];
  const request = records.findLast(r => r.stage === 'request')?.data;
  const assessmentRecord = records.findLast(r => r.stage === 'assessment');
  const assessment = assessmentRecord ? assessmentRecord.data.assessment
    : records.findLast(r => r.stage === 'validation' && r.data.valid === true)?.data.assessment;
  const provider = latest('requestedProvider') ?? request?.provider;
  const explicitModel = records.some(r => Object.hasOwn(r.data, 'requestedModel'));
  const requestedModel = explicitModel ? latest('requestedModel') : object(request?.payload) ? request.payload.model : null;
  const knownContract = latest('judgeReportVersion') === 'judge-report-v1'
    || records.some(r => validNativeContract(r.data.nativeContract));
  return {
    provider: typeof provider === 'string' ? provider : null,
    requestedModel: typeof requestedModel === 'string' ? requestedModel : null,
    returnedModel: object(assessment) && typeof assessment.model === 'string' ? assessment.model : null,
    experimental: knownContract && provider === 'apus-llamacpp' ? true : null,
  };
}
export function nativeHistory(records: ArchiveRecord[]) {
  const record = records.find(r => validNativeContract(r.data.nativeContract));
  if (!record) return null;
  const responses = records.filter(r => r.stage === 'response' && validNativeContract(r.data.nativeContract));
  const values = responses.filter(r => r.data.truncated === false && object(r.data.value)).map(r => r.data.value as Record<string, any>);
  return {
    contract: record.data.nativeContract as typeof APUS_V1,
    snapshots: responses.map(r => r.data),
    requests: values.filter(v => v.kind === 'native-request'),
    responses: values.filter(v => v.kind === 'native-response'),
    metadata: values.filter(v => v.kind === 'metadata'),
    deterministic: values.filter(v => v.derivation === 'sole-allowed-facts-selector'),
    omissions: responses.filter(r => r.data.truncated === true || r.data.unavailable === true).map(r => r.data),
    failureCategory: records.findLast(r => r.stage === 'validation' && validNativeContract(r.data.nativeContract) && r.data.valid === false)?.data.nativeCategory ?? null,
  };
}
