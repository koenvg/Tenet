import { freeze } from '../decision/evidence.js';
import { readConfig, type GuardConfig } from './config.js';
import { OBSERVATION_LIMITS, type ObservationLimits } from './observation-queue.js';
import { ownerHome, positiveInteger, readOwnerSettings, timerInteger, type SettingsSnapshot, type SettingsFailure } from './settings.js';

/** Safe owner diagnostics, never the settings payload, destination or credentials. */
export interface ConfigurationStatus {
  readonly source: '~/.tenet/config.json';
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

/** One startup snapshot. The internal home seam is for isolated offline fixtures only. */
export function prepareConfiguration(options: {
  env: Record<string, string | undefined>; observationLimits?: Partial<ObservationLimits>; home?: string;
}): PreparedConfiguration {
  const home = options.home ?? ownerHome();
  const settings = readOwnerSettings(home);
  const base = { source: '~/.tenet/config.json' as const, settings: settings.state };
  if (settings.state === 'invalid') return freeze({ settings,
    status: { ...base, availability: 'unavailable' as const, reason: settings.reason, deadlineMs: null, observation: null } });
  try {
    const value = settings.state === 'valid' ? settings.value : undefined;
    // readConfig does not inspect files. Only policyPath varies between sessions.
    const { policyPath: _path, ...common } = readConfig(home, options.env, value?.decision?.deadlineMs);
    const observation = { ...OBSERVATION_LIMITS, ...value?.observation, ...options.observationLimits };
    if (!Object.values(observation).every(positiveInteger) || !timerInteger(observation.ageMs)) throw new Error();
    return freeze({ settings, common, status: { ...base, availability: 'ready' as const,
      deadlineMs: common.decision.deadlineMs, observation } });
  } catch { return freeze({ settings, status: { ...base, availability: 'unavailable' as const,
    reason: 'effective-limits' as const, deadlineMs: null, observation: null } }); }
}
