import { createGuard, SDK_VERSION, type Guard, type GuardOptions, type OwnerEvent, type Assessment } from 'tenet';
const version: string = SDK_VERSION;
const events: OwnerEvent[] = [];
const options: GuardOptions = { host: 'isolated-types', env: { TENET_RECORDING: 'off' }, onOwnerEvent: event => events.push(event),
  judge: async (): Promise<Assessment> => ({ profile: 'applicability-v1', model: 'scripted', rules: [] }) };
const guard: Guard = createGuard(options);
void guard.close();
void version;
