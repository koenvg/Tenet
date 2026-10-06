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
const session = guard.openSession({ sessionId: 'typed', contextId: 'main' }, '/disposable/session');
void session.ready.then(value => {
  const version: 'policy-sources-v1' = value.policy.contractVersion;
  const digest: string | null = value.policy.combinedDigest;
  const failedRole: 'global' | 'project' | undefined = value.policy.failedRole;
  value.policy.sources.forEach(source => {
    const role: 'global' | 'project' = source.role;
    const count: number = source.ruleCount;
    void role; void count;
    // @ts-expect-error readiness does not disclose rule prose
    void source.rules;
  });
  void version; void digest; void failedRole;
});
void guard.close();
void version;
