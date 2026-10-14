import type { Policy } from '../decision/contracts.js';
import type { JudgeStatus } from './judge.js';
import type { CaptureStatus, OwnerEvent, OwnerReport, ProjectStatus, SessionStatus } from '../sdk/types.js';
import { recordedJudgeReport, type JudgeReport } from '../recording/judge.js';
import { validPolicySnapshot } from '../decision/policy-contract.js';
import { validNativeContract } from '../recording/native.js';
import type { RecordingSink, Stage } from '../recording/contract.js';
import type { RuntimeReportData } from './guard.js';
import type { RecordingIdentity, HostIdentity } from '../recording/contract.js';

const controls = /[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Disclosure-only projections. These copies must never enter routing or authorization. */
export function diagnosticSafety(secrets: readonly (string | undefined)[]) {
  const hidden = [...new Set(secrets.filter((s): s is string => !!s))].sort((a, b) => b.length - a.length);
  const contains = (value: string) => hidden.some(secret => value.includes(secret));
  const text = (value: string, limit = Infinity) => {
    for (const secret of hidden) value = value.split(secret).join('[redacted]');
    return value.replace(controls, '?').slice(0, limit);
  };
  const contentUnsafe = (value: unknown): boolean => {
    if (typeof value === 'string') return contains(value) || hidden.some(secret => value.includes(JSON.stringify(secret).slice(1, -1)));
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, item]) => contains(key) || contentUnsafe(item));
  };
  const withheld = (value: string | null | undefined) => typeof value === 'string' && text(value) !== value;
  const identity = (value: JudgeStatus): JudgeStatus => withheld(value.requestedModel) || withheld(value.requestedDestination)
    ? { ...value, provider: 'unknown', requestedModel: null, requestedDestination: null, transportContract: null, authentication: null }
    : { ...value };
  const judgeReport = (value: JudgeReport): JudgeReport => {
    const { returnedModel, ...requested } = value;
    const safe = withheld(requested.requestedModel) || ('requestedDestination' in requested && withheld(requested.requestedDestination))
      ? { ...requested, requestedProvider: 'unknown' as const, requestedModel: null,
        ...('requestedDestination' in requested ? { requestedDestination: null, transportContract: null, authentication: null } : {}) }
      : requested;
    return { ...safe, ...(returnedModel && !withheld(returnedModel) ? { returnedModel } : {}) };
  };
  const policyUnsafe = (value: Policy) => value.candidates.some(c => contains(c.source)) || value.available
    && (contains(value.combinedDigest) || value.sources.some(s => contains(s.source) || contains(s.target)
      || contains(s.digest) || s.rules.some(r => contains(r.text))));
  const policySummary = (value: SessionStatus['policy']): SessionStatus['policy'] => {
    if (value.candidates.some(c => withheld(c.source)) || withheld(value.combinedDigest) || value.sources.some(s => withheld(s.source) || withheld(s.target) || withheld(s.digest))) {
      return { ...value, candidates: [], sources: [], combinedDigest: null, reason: 'diagnostic-content-withheld' };
    }
    return value;
  };
  const rules = (value: OwnerReport['rules']): OwnerReport['rules'] => value
    .filter(r => ![r.origin.source, r.origin.target, r.origin.digest].some(withheld))
    .map(({ text: content, ...r }) => ({ ...r, ...(content !== undefined && !withheld(content) ? { text: content } : {}) }));
  const report = (value: OwnerReport): OwnerReport => {
    const recorded = recordedJudgeReport({ ...value });
    const { returnedModel: _returnedModel, ...rest } = value;
    return { ...rest, ...(recorded ? judgeReport(recorded) : {}), rules: rules(value.rules) };
  };
  const ownerEvent = (event: OwnerEvent): OwnerEvent => {
    if (event.type === 'capture') return { ...event, capture: captureStatus(event.capture) };
    if (event.type === 'permission' || event.type === 'assessment') return { ...event, ...(event.report ? { report: report(event.report) } : {}) };
    return event;
  };
  const captureStatus = (value: CaptureStatus): CaptureStatus => value.kind === 'external' ? value : { ...value, directory: text(value.directory) };
  const projectStatus = (value: ProjectStatus): ProjectStatus => ({ ...value, directory: text(value.directory), judge: identity(value.judge) });
  const sessionStatus = (value: SessionStatus): SessionStatus => ({ ...value, directory: text(value.directory), judge: identity(value.judge),
    policy: policySummary(value.policy), capabilities: { ...value.capabilities, host: text(value.capabilities.host),
      version: value.capabilities.version === null ? null : text(value.capabilities.version),
      profile: value.capabilities.profile === null ? null : text(value.capabilities.profile), limitations: value.capabilities.limitations.map(v => text(v)) } });
  const ownerRecord = (value: RuntimeReportData): RuntimeReportData | undefined => {
    if ([value.assessment, value.resolvedAction].some(contentUnsafe)) return;
    const { returnedModel: _returnedModel, ...rest } = value;
    const recorded = recordedJudgeReport(value);
    return { ...rest, ...(recorded ? judgeReport(recorded) : {}),
      ...(value.judge ? { judge: identity(value.judge) } : {}),
      ...(value.policy && policyUnsafe(value.policy) ? { diagnosticContent: 'withheld', policy: { available: false, contractVersion: 'policy-sources-v1', candidates: [], reason: 'policy-unavailable' } as const } : {}),
      ...(value.rules ? { rules: rules(value.rules) } : {}) };
  };
  // Exact capture contracts are all-or-nothing. Never edit JSON, paths or byte counts.
  const captureData = (stage: Stage, data: Record<string, unknown>): Record<string, unknown> | undefined => {
    if ((stage === 'begin' || stage === 'request') && validPolicySnapshot(data.policy) && policyUnsafe(data.policy)) return;
    const content = stage === 'begin' ? [data.adapterCoverage]
      : stage === 'request' ? [data.payload, data.integrity]
      : stage === 'response' ? [data.value, data.preview]
      : stage === 'assessment' ? [data.assessment, data.resolvedAction]
      : stage === 'validation' ? [data.assessment]
      : stage === 'decision' ? [data.contributions]
      : stage === 'permission' ? [data.rules] : [];
    if (content.some(contentUnsafe)) return;
    const recorded = recordedJudgeReport(data);
    const { returnedModel: _returnedModel, ...rest } = data;
    return recorded ? { ...rest, ...judgeReport(recorded) } : data;
  };
  const recordingIdentity = (value: RecordingIdentity & HostIdentity) => ![value.host, value.sessionId, value.contextId,
    value.callId, value.toolName, value.cwd].some(contains);
  const recording = (sink: RecordingSink, lost: () => void): RecordingSink => (stage, data) => {
    if (stage === 'response' && data.unavailable === true && data.reason === 'diagnostic-content-withheld') lost();
    const safe = captureData(stage, data);
    if (safe) sink(stage, safe);
    else {
      lost();
      sink('response', { untrusted: true, unavailable: true, reason: 'diagnostic-content-withheld', omittedStage: stage,
        ...(data.inputVersion === 'judge-input-scopes-v1' ? { inputVersion: data.inputVersion } : {}),
        ...(validNativeContract(data.nativeContract) ? { nativeContract: data.nativeContract } : {}) });
    }
  };
  return { secrets: hidden, text, contains, identity, policySummary, ownerEvent, ownerRecord, sessionStatus, projectStatus, captureStatus, recordingIdentity, recording };
}
export type DiagnosticSafety = ReturnType<typeof diagnosticSafety>;
