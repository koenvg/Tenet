import { realpathSync, statSync } from 'node:fs';
import type { Judge, JudgeIdentity } from '../decision/contracts.js';
import { prepareJudge, type JudgeStatus } from './judge.js';
import { prepareConfiguration, snapshotOwnerConfiguration, type ConfigurationStatus } from './configuration.js';
import { readMode } from './config.js';
import { ArchiveWriter, parseBbThreadId, recordingConfig } from '../recording/archive.js';
import { ActivationStore, type Activation } from './activation.js';
import { GuardRuntime, type Capabilities, type RuntimeOptions } from './guard.js';
import { OperationsRuntime } from './operations.js';

import { diagnosticSafety, type DiagnosticSafety } from './diagnostic-safety.js';
export interface ProjectResources {
  readonly directory: string;
  readonly runtime: GuardRuntime;
  readonly judgeStatus: JudgeStatus;
  readonly configurationStatus: ConfigurationStatus;
  readonly hasJudge: boolean;
  readonly diagnostics: DiagnosticSafety;
}

/** Owner control, archive and injection outlive individual project sessions. */
export function createRuntimeResources(options: Omit<RuntimeOptions, 'judge' | 'activation' | 'bindRecording' | 'operations'> & {
  capabilities: Capabilities;
  judge?: Judge;
  createJudge?: () => Judge;
  judgeIdentity?: JudgeIdentity;
  controlPath?: string;
  bindRecording?: RuntimeOptions['bindRecording'];
  onCaptureHealth?: () => void;
}) {
  const env = Object.freeze({ ...options.env });
  const owner = snapshotOwnerConfiguration({ env });
  const observationLimits = options.observationLimits ? Object.freeze({ ...options.observationLimits }) : undefined;
  const { mode } = readMode(env);
  const activation = new ActivationStore(options.controlPath ?? env.TENET_CONTROL_PATH);
  const archive = options.bindRecording ? undefined : new ArchiveWriter(recordingConfig(env), undefined, options.onCaptureHealth);
  const projects = new Map<string, ProjectResources>();
  const diagnostics = () => diagnosticSafety([...projects.values()].flatMap(project => project.diagnostics.secrets));
  const operations = archive?.config.enabled ? new OperationsRuntime(archive.config, diagnostics, () => archive.health()) : undefined;
  const results = { resultCallIds: new Set<string>(), ambiguousResults: new Set<string>() };
  const judgeIdentity = options.judgeIdentity ? Object.freeze({ ...options.judgeIdentity }) : undefined;
  const injected = options.judge || options.createJudge
    ? prepareJudge({ ...options, env, judgeIdentity,
      configuration: prepareConfiguration({ owner, observationLimits }) }).judge : undefined;
  return { activation, archive, mode, diagnostics,
    project(cwd: string): ProjectResources {
      let directory: string;
      try {
        directory = realpathSync(cwd);
        if (!statSync(directory).isDirectory()) throw new Error();
      } catch { throw new Error('invalid-project-directory'); }
      const existing = projects.get(directory);
      if (existing) return existing;
      const prepared = prepareJudge({ ...options, env, judge: injected, createJudge: undefined, judgeIdentity,
        configuration: prepareConfiguration({ owner, project: directory, observationLimits }) });
      const bind = options.bindRecording ?? (identity => archive!.bind({ ...identity,
        bbThreadId: parseBbThreadId(env.BB_THREAD_ID) }));
      const runtime = new GuardRuntime({ ...options, env, judge: prepared.judge, judgeStatus: prepared.status, activation, operations,
        configuration: prepared.configuration, observationLimits: prepared.configuration.status.observation ?? {},
        emit: (stage, data, archiveData) => {
          const safe = diagnostics().ownerRecord(data);
          if (safe) options.emit?.(stage, safe, archiveData);
        },
        bindRecording: identity => {
          // Correlation and cwd are exact facts. Omit capture rather than invent an identity.
          const safe = diagnostics();
          const lost = () => archive?.captureSuppressed();
          if (!safe.recordingIdentity(identity)) {
            lost();
            return () => {};
          }
          const sink = bind(identity);
          return (stage, data) => {
            const current = diagnostics();
            if (!current.recordingIdentity(identity)) lost();
            else current.recording(sink, lost)(stage, data);
          };
        },
      }, options.capabilities, results);
      const project = Object.freeze({ directory, runtime, diagnostics: prepared.diagnostics, judgeStatus: prepared.status,
        configurationStatus: prepared.configuration.status, hasJudge: prepared.status.availability === 'ready' });
      projects.set(directory, project);
      return project;
    },
    status() {
      return [...projects.values()].map(project => diagnostics().projectStatus({ directory: project.directory,
        judge: project.judgeStatus, configuration: project.configurationStatus, observations: project.runtime.observationQueue.health() }));
    },
    activationChanged(value: Activation) {
      for (const project of projects.values()) project.runtime.activationChanged(value);
    },
    async close(timeoutMs: number) {
      for (const project of projects.values()) project.runtime.shutdown();
      activation.close();
      const closed = await Promise.all([archive?.close(timeoutMs) ?? true, operations?.close(timeoutMs) ?? true]);
      return closed.every(Boolean);
    },
  };
}
