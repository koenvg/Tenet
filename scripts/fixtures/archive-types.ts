import { createGuard, SDK_VERSION, type Guard, type GuardOptions, type OwnerEvent, type Assessment } from 'tenet';
const version: string = SDK_VERSION;
const events: OwnerEvent[] = [];
const options: GuardOptions = { host: 'isolated-types', env: { TENET_RECORDING: 'off' }, onOwnerEvent: event => events.push(event),
  judge: async (): Promise<Assessment> => ({ profile: 'applicability-v1', model: 'scripted', rules: [] }) };
const guard: Guard = createGuard(options);
const status = guard.status();
const provider: 'typesafe' | 'apus-llamacpp' | 'injected' | 'unknown' = status.judge.provider;
const model: string | null = status.judge.requestedModel;
const deadline: number | null = status.configuration.deadlineMs;
const running: number | undefined = status.configuration.observation?.running;
void provider; void model; void deadline; void running;
void guard.close();
void version;
