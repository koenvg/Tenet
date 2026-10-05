import type { Judge, JudgeIdentity } from '../decision/contracts.js';
import { prepareJudge } from './judge.js';
import { prepareConfiguration } from './configuration.js';
import { ArchiveWriter, parseBbThreadId, recordingConfig } from '../recording/archive.js';
import { ActivationStore } from './activation.js';
import { GuardRuntime, type Capabilities, type RuntimeOptions } from './guard.js';

/** Shared startup wiring. Provider construction and control watching remain lazy. */
export function createRuntimeResources(options: Omit<RuntimeOptions, 'judge' | 'activation' | 'bindRecording'> & {
  capabilities: Capabilities;
  judge?: Judge;
  createJudge?: () => Judge;
  judgeIdentity?: JudgeIdentity;
  controlPath?: string;
  bindRecording?: RuntimeOptions['bindRecording'];
  onCaptureHealth?: () => void;
}) {
  const env = Object.freeze({ ...options.env });
  const activation = new ActivationStore(options.controlPath ?? env.TENET_CONTROL_PATH);
  const archive = options.bindRecording ? undefined : new ArchiveWriter(recordingConfig(env), undefined, options.onCaptureHealth);
  const prepared = prepareJudge({ ...options, env, configuration: prepareConfiguration({ env, observationLimits: options.observationLimits }) });
  const runtime = new GuardRuntime({ ...options, env, judge: prepared.judge, judgeStatus: prepared.status, activation,
    configuration: prepared.configuration, observationLimits: prepared.configuration.status.observation ?? {},
    bindRecording: options.bindRecording ?? (identity => archive!.bind({ ...identity,
      bbThreadId: parseBbThreadId(env.BB_THREAD_ID) })),
  }, options.capabilities);
  return { runtime, activation, archive,
    judgeStatus: prepared.status,
    configurationStatus: prepared.configuration.status,
    hasJudge: prepared.status.availability === 'ready',
    async close(timeoutMs: number) {
      runtime.shutdown(); activation.close();
      return archive ? archive.close(timeoutMs) : true;
    },
  };
}
