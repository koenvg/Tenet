import type { ConfigurationStatus, ConfigurationSource } from '../runtime/configuration.js';
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const timerInteger = (value: unknown): value is number => positiveInteger(value) && value <= 2147483647;

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const oneOf = (value: unknown, values: readonly string[]): value is string => typeof value === 'string' && values.includes(value);
const source = (v: unknown): v is ConfigurationSource => oneOf(v, ['owner', 'project', 'default', 'environment', 'sdk']);
export function recordedConfiguration(value: unknown): ConfigurationStatus | undefined {
  if (!object(value) || !oneOf(value.source, ['~/.tenet/config.json', '~/.tenet/config.json + <project>/.tenet/config.json'])
    || !oneOf(value.settings, ['absent', 'valid', 'invalid']) || !oneOf(value.availability, ['ready', 'unavailable'])
    || value.reason !== undefined && !oneOf(value.reason, ['unsafe', 'unreadable', 'oversized', 'malformed', 'schema', 'effective-limits'])
    || !object(value.sources)) return;
  const { judge, deadlineMs, observation } = value.sources;
  if (judge !== null && !source(judge) || deadlineMs !== null && !source(deadlineMs)) return;
  const keys = ['running', 'waiting', 'bytes', 'ageMs'] as const;
  const limits = value.observation;
  if (value.availability === 'ready') {
    if (!timerInteger(value.deadlineMs) || !object(limits) || !object(observation)
      || !keys.every(key => (key === 'ageMs' ? timerInteger(limits[key]) : positiveInteger(limits[key])) && source(observation[key]))) return;
  } else if (value.deadlineMs !== null || limits !== null) return;
  if (observation !== null && (!object(observation) || !keys.every(key => source(observation[key])))) return;
  return {
    source: value.source as ConfigurationStatus['source'], settings: value.settings as ConfigurationStatus['settings'],
    availability: value.availability as ConfigurationStatus['availability'],
    ...(value.reason !== undefined ? { reason: value.reason as ConfigurationStatus['reason'] } : {}),
    deadlineMs: value.deadlineMs as number | null,
    observation: object(limits) ? Object.fromEntries(keys.map(key => [key, limits[key]])) as ConfigurationStatus['observation'] : null,
    sources: { judge: judge as ConfigurationSource | null, deadlineMs: deadlineMs as ConfigurationSource | null,
      observation: object(observation) ? Object.fromEntries(keys.map(key => [key, observation[key]])) as Record<typeof keys[number], ConfigurationSource> : null },
  };
}
