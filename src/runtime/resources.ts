import type { Judge } from '../decision/contracts.js';
import { ArchiveWriter, parseBbThreadId, recordingConfig } from '../recording/archive.js';
import { ActivationStore } from './activation.js';
import { GuardRuntime, type Capabilities, type RuntimeOptions } from './guard.js';

/** Shared startup wiring. Provider construction and control watching remain lazy. */
export function createRuntimeResources(options: Omit<RuntimeOptions, 'judge' | 'activation' | 'bindRecording'> & {
  capabilities: Capabilities;
  judge?: Judge;
  createJudge?: () => Judge;
  controlPath?: string;
  bindRecording?: RuntimeOptions['bindRecording'];
}) {
  const env = Object.freeze({ ...options.env });
  const activation = new ActivationStore(options.controlPath ?? env.TENET_CONTROL_PATH);
  const archive = options.bindRecording ? undefined : new ArchiveWriter(recordingConfig(env));
  let provider = options.judge;
  const judge: Judge = async (request, signal, recording) => {
    if (!provider) {
      if (options.createJudge) provider = options.createJudge();
      else {
        const { createJevJudge } = await import('../decision/jev.js');
        provider ??= createJevJudge({ apiKey: env.TYPESAFE_API_KEY });
      }
    }
    return provider(request, signal, recording);
  };
  const runtime = new GuardRuntime({ ...options, env, judge, activation,
    bindRecording: options.bindRecording ?? (identity => archive!.bind({ ...identity,
      bbThreadId: parseBbThreadId(env.BB_THREAD_ID) })),
  }, options.capabilities);
  return { runtime, activation, archive,
    hasJudge: !!(options.judge || options.createJudge || env.TYPESAFE_API_KEY?.trim()),
    async close(timeoutMs: number) {
      runtime.shutdown(); activation.close();
      return archive ? archive.close(timeoutMs) : true;
    },
  };
}
