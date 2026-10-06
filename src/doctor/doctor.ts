import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadPolicy } from '../decision/policy.js';
import type { PolicyFailure } from '../decision/contracts.js';
import { readMode, type Mode } from '../runtime/config.js';
import { selectPolicies } from '../runtime/policy-selection.js';
import { ActivationStore, type Activation } from '../runtime/activation.js';
import { recordingConfig } from '../recording/archive.js';
import { inspectCompatibility, inspectDelivery, type Compatibility } from './installation.js';
export { DELIVERY_FILES } from './installation.js';
import { prepareJudge, type JudgeStatus } from '../runtime/judge.js';
import type { ConfigurationStatus } from '../runtime/configuration.js';

interface Diagnostic { code: string; guidance: string }
export interface DoctorReport {
  schemaVersion: 2;
  state: 'ready' | 'off' | 'dormant' | 'invalid' | 'unavailable';
  exitCode: 0 | 1;
  project: string;
  mode: Mode;
  configuration: 'valid' | 'invalid';
  settings: ConfigurationStatus;
  policy: import('../sdk/types.js').SessionStatus['policy'] & { validation: 'valid' | 'invalid' | 'absent' };
  control: Activation;
  judge: JudgeStatus;
  credentials: { presence: 'present' | 'missing'; validity: 'unverified' };
  capture: { state: 'local-archive' | 'disabled'; directory: string; configuration: 'valid' | 'invalid'; writability: 'unverified' };
  delivery: Awaited<ReturnType<typeof inspectDelivery>>;
  compatibility: Compatibility;
  hooks: 'unverified';
  provider: 'unverified';
  assessment: 'not-requested';
  issues: Diagnostic[];
  limitations: Diagnostic[];
}

/** Read local setup only. No session, provider client, archive writer, watcher or host is constructed. */
export async function diagnoseProject(options: {
  projectDir: string; deliveryDir: string; env: Record<string, string | undefined>;
}): Promise<DoctorReport> {
  const env = { ...options.env }, project = resolve(options.projectDir);
  // Externally derived diagnostics must not disclose credentials or terminal control characters.
  const safeDiagnostic = (value: string) => {
    const secret = env.TYPESAFE_API_KEY;
    return (secret ? value.split(secret).join('[redacted]') : value).replace(/[\x00-\x1f\x7f-\x9f]/g, '?').slice(0, 512);
  };
  const issues: Diagnostic[] = [], limitations: Diagnostic[] = [];
  const issue = (code: string, guidance: string) => issues.push({ code, guidance });
  const limit = (code: string, guidance: string) => limitations.push({ code, guidance });
  let invalid = false;
  try { if (!(await stat(project)).isDirectory()) throw new Error(); }
  catch { invalid = true; issue('project-unavailable', 'Select an existing readable project directory with --project.'); }
  const selectedMode = readMode(env);
  const { status: judge, configuration: prepared } = prepareJudge({ env });
  let configuration: DoctorReport['configuration'] = prepared.status.availability === 'ready' ? 'valid' : 'invalid';
  const selected = await selectPolicies(project, env);
  if (selectedMode.warning) configuration = 'invalid';
  if (configuration === 'invalid') {
    invalid = true;
    issue('configuration', 'Check private owner config.json, supported settings fields, TENET_POLICY, TENET_MODE, decision/evidence limits, approval timeout and TENET_SENSITIVE_FIELDS. Mode must be observe or enforce. Doctor does not print or repair settings.');
  }
  const eligible = selected.eligible;
  const loaded = eligible ? await loadPolicy(selected.candidates) : undefined;
  const policy: DoctorReport['policy'] = {
    contractVersion: 'policy-sources-v1', candidates: selected.candidates.map(c => ({ role: c.role, selection: c.selection,
      source: safeDiagnostic(c.source), presence: c.presence })),
    sources: loaded?.available ? loaded.sources.map(({ rules, ...s }) => ({ ...s, ruleCount: rules.length,
      source: safeDiagnostic(s.source), target: safeDiagnostic(s.target), digest: safeDiagnostic(s.digest) })) : [],
    validation: !eligible ? 'absent' : loaded?.available ? 'valid' : 'invalid',
    combinedDigest: loaded?.available ? safeDiagnostic(loaded.combinedDigest) : null,
    ruleCount: loaded?.available ? loaded.rules.length : 0,
    ...(loaded && !loaded.available ? { reason: loaded.reason, failedRole: loaded.failedRole } : {}),
  };
  if (loaded && !loaded.available) {
    invalid = true;
    issue(loaded.reason, `Check the ${loaded.failedRole ?? 'selected'} policy file and its UTF-8 Rule; declarations, size and rule limits. Doctor does not print or repair policy text.`);
  } else if (!eligible) limit('policy-absent', 'Both implicit global and project candidates are absent; no project override is set. Author it outside the guarded action path to enable it.');
  let control: Activation = 'unavailable';
  try { control = new ActivationStore(env.TENET_CONTROL_PATH).read(); } catch { /* Invalid paths are bounded diagnostics. */ }
  if (control === 'unavailable') {
    invalid = true; issue('control-unavailable', 'Check the absolute TENET_CONTROL_PATH and private same-user control file and directory. Do not use links.');
  }
  const capture = recordingConfig(env);
  if (capture.issue) {
    invalid = true; issue(capture.issue, 'Set TENET_RECORDING to on or off and TENET_RECORDING_DIR to an absolute path.');
  }
  const presence = env.TYPESAFE_API_KEY?.trim() ? 'present' : 'missing';
  if (judge.reason === 'missing-credentials') limit(judge.reason, 'Configure TYPESAFE_API_KEY securely before starting an active session. Presence does not verify provider validity.');
  if (judge.experimental) limit('experimental-judge', 'APUS is experimental. Local readiness does not verify connectivity, calibration or enforcement accuracy.');
  const delivery = await inspectDelivery(resolve(options.deliveryDir));
  if (delivery.status === 'incomplete') issue('delivery-incomplete', 'Build the SDK/CLI and inspector, install locked runtime dependencies, or replace the incomplete installation.');
  const compatibility = await inspectCompatibility(project, resolve(options.deliveryDir), env.PATH);
  // Evaluate compatibility using raw metadata, then redact it before it enters either output format.
  if (compatibility.version !== null) compatibility.version = safeDiagnostic(compatibility.version);
  if (compatibility.status === 'unavailable') issue('untested-pi-version', `Use tested Pi ${compatibility.testedVersion}, or a Tenet release tested with your host. Detected compatibility is unavailable.`);
  if (compatibility.status === 'unknown') limit('host-version-unknown', `Pi version metadata was not identified. Verify the intended host is Pi ${compatibility.testedVersion}; do not infer compatibility.`);
  limit('hooks-unverified', 'Restart Pi and verify native /tenet status. Doctor cannot verify registration, hook activation or protection.');
  limit('provider-unverified', 'Doctor never contacts a judge provider. Local settings or credential presence do not establish connectivity, calibration or accuracy.');
  limit('capture-writability-unverified', 'Capture configuration is inspected only. Directory writability is not probed and no recordings are created.');
  limit('pi-coverage', 'Pi lacks exact result correlation, post-hook argument stability and stock authenticated action resolution. Hook checks are not OS isolation. The Claude Code prototype is not supported by this setup path.');
  const bypass = control === 'off' ? 'off' : !eligible ? 'dormant' : undefined;
  const unavailable = delivery.status === 'incomplete' || compatibility.status === 'unavailable' || (!bypass && judge.availability === 'unavailable');
  const state = invalid ? 'invalid' : unavailable ? 'unavailable' : bypass ?? 'ready';
  return {
    schemaVersion: 2, state, exitCode: state === 'invalid' || state === 'unavailable' ? 1 : 0,
    project: safeDiagnostic(project), mode: selectedMode.mode, configuration, settings: prepared.status, policy, control, judge,
    credentials: { presence, validity: 'unverified' },
    capture: { state: capture.enabled ? 'local-archive' : 'disabled', directory: safeDiagnostic(capture.directory),
      configuration: capture.issue ? 'invalid' : 'valid', writability: 'unverified' },
    delivery, compatibility, hooks: 'unverified', provider: 'unverified', assessment: 'not-requested', issues, limitations,
  };
}

export function formatDoctor(report: DoctorReport): string {
  return [
    `TENET doctor: ${report.state} (local setup only)`,
    `Project: ${report.project}`,
    `Mode: ${report.mode}; configuration: ${report.configuration}; cooperative control: ${report.control}`,
    `Policy set: ${report.policy.contractVersion}; ${report.policy.validation}${report.policy.reason ? ` (${report.policy.reason})` : ''}`,
    ...report.policy.candidates.map(c => `Policy candidate: ${c.role} ${c.selection} ${c.source}; ${c.presence}`),
    ...report.policy.sources.map(s => `Policy source: ${s.role} ${s.source}; target ${s.target}; SHA-256 ${s.digest}; ${s.bytes} bytes; ${s.ruleCount} rules`),
    `Combined policy digest: ${report.policy.combinedDigest ?? 'unavailable'}; declared rules: ${report.policy.ruleCount}`,
    `Judge: ${report.judge.provider}${report.judge.experimental ? ' experimental' : ''}; requested model: ${report.judge.requestedModel ?? 'unknown'}; local availability: ${report.judge.availability}`,
    `Settings: ${report.settings.source}; ${report.settings.settings}${report.settings.reason ? ` (${report.settings.reason})` : ''}; deadline ms: ${report.settings.deadlineMs ?? 'unavailable'}; observation: ${report.settings.observation ? JSON.stringify(report.settings.observation) : 'unavailable'}`,
    `Credentials: ${report.credentials.presence}; validity: unverified; provider connectivity: unverified`,
    `Capture: ${report.capture.state}; ${report.capture.directory}; configuration: ${report.capture.configuration}; writability: unverified`,
    `Delivery: ${report.delivery.status}${report.delivery.missing.length ? `; missing: ${report.delivery.missing.join(', ')}` : ''}`,
    `Pi compatibility: ${report.compatibility.status}; detected: ${report.compatibility.version ?? 'unknown'} (${report.compatibility.source}); tested: ${report.compatibility.testedVersion}`,
    'Hooks: unverified; assessment: not-requested',
    'Provider execution: not-requested; label matching: unverified; calibration: unverified',
    ...report.issues.map(i => `Issue ${i.code}: ${i.guidance}`),
    ...report.limitations.map(i => `Limitation ${i.code}: ${i.guidance}`),
  ].join('\n') + '\n';
}
