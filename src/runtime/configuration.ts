import { freeze } from '../decision/evidence.js';
import { MODEL } from '../decision/typesafe-contract.js';
import { readConfig, type GuardConfig } from './config.js';
import { OBSERVATION_LIMITS, type ObservationLimits } from './observation-queue.js';
import { ownerHome, positiveInteger, readOwnerSettings, readProjectSettings, timerInteger,
  type SettingsSnapshot, type SettingsFailure, type JudgeSettings } from './settings.js';

export const DEFAULT_JUDGE: Readonly<JudgeSettings> = freeze({ protocol: 'system-one',
  baseUrl: 'https://api.typesafe.ai', model: MODEL, auth: { type: 'bearer-env', name: 'TYPESAFE_API_KEY' } });
/** Internal startup inputs. Never serialize this object into owner reports or recordings. */
export interface OwnerConfiguration {
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly settings: SettingsSnapshot;
}
export function snapshotOwnerConfiguration(options: { env: Readonly<Record<string, string | undefined>>; home?: string }): OwnerConfiguration {
  const home = options.home ?? ownerHome();
  return freeze({ home, env: { ...options.env }, settings: readOwnerSettings(home) });
}
/** Safe diagnostics, never settings contents, destinations or credential references. */
export interface ConfigurationStatus {
  readonly source: '~/.tenet/config.json' | '~/.tenet/config.json + <project>/.tenet/config.json';
  readonly settings: 'absent' | 'valid' | 'invalid';
  readonly availability: 'ready' | 'unavailable';
  readonly reason?: SettingsFailure | 'effective-limits';
  readonly deadlineMs: number | null;
  readonly observation: Readonly<ObservationLimits> | null;
}
export interface PreparedConfiguration {
  readonly settings: SettingsSnapshot;
  readonly status: ConfigurationStatus;
  readonly common?: Readonly<Omit<GuardConfig, 'policyPath'>>;
}

/** Prepare one canonical project from frozen owner inputs. Runtime caching is the caller's responsibility. */
export function prepareConfiguration(options: {
  observationLimits?: Partial<ObservationLimits>; project?: string;
} & ({ owner: OwnerConfiguration } | { env: Readonly<Record<string, string | undefined>>; home?: string })): PreparedConfiguration {
  const owner = 'owner' in options ? options.owner : snapshotOwnerConfiguration(options);
  const project = options.project === undefined ? { state: 'absent' as const } : readProjectSettings(options.project);
  const source = options.project === undefined ? '~/.tenet/config.json' as const
    : '~/.tenet/config.json + <project>/.tenet/config.json' as const;
  const invalid = owner.settings.state === 'invalid' ? owner.settings : project.state === 'invalid' ? project : undefined;
  if (invalid) return freeze({ settings: invalid,
    status: { source, settings: 'invalid' as const, availability: 'unavailable' as const,
      reason: invalid.reason, deadlineMs: null, observation: null } });
  const inherited = owner.settings.state === 'valid' ? owner.settings.value : undefined;
  const overlay = project.state === 'valid' ? project.value : undefined;
  const judge = overlay?.judge ?? inherited?.judge ?? DEFAULT_JUDGE;
  const settings: SettingsSnapshot = owner.settings.state === 'absent' && project.state === 'absent' ? { state: 'absent' }
    : { state: 'valid', value: { version: 2, judge: judge,
      decision: { ...inherited?.decision, ...overlay?.decision }, observation: { ...inherited?.observation, ...overlay?.observation } } };
  const base = { source, settings: settings.state };
  try {
    const value = settings.state === 'valid' ? settings.value : undefined;
    // readConfig does not inspect files. Only policyPath varies between sessions.
    const { policyPath: _path, ...common } = readConfig(owner.home, owner.env, value?.decision?.deadlineMs);
    const observation = { ...OBSERVATION_LIMITS, ...value?.observation, ...options.observationLimits };
    if (!Object.values(observation).every(positiveInteger) || !timerInteger(observation.ageMs)) throw new Error();
    return freeze({ settings, common, status: { ...base, availability: 'ready' as const,
      deadlineMs: common.decision.deadlineMs, observation } });
  } catch { return freeze({ settings, status: { ...base, availability: 'unavailable' as const,
    reason: 'effective-limits' as const, deadlineMs: null, observation: null } }); }
}
