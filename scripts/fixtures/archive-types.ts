import { createGuard, SDK_VERSION, type Guard, type GuardOptions, type OwnerEvent, type Assessment } from 'tenet';
const version: string = SDK_VERSION;
const events: OwnerEvent[] = [];
const options: GuardOptions = { host: 'isolated-types', env: { TENET_RECORDING: 'off' }, onOwnerEvent: event => events.push(event),
  judge: async (): Promise<Assessment> => ({ profile: 'applicability-v1', model: 'scripted', rules: [] }) };
const guard: Guard = createGuard(options);
const status = guard.status();
for (const project of status.projects) {
  const directory: string = project.directory;
  const provider: 'system-one' | 'apus-llamacpp' | 'injected' | 'unknown' = project.judge.provider;
  const model: string | null = project.judge.requestedModel;
  const deadline: number | null = project.configuration.deadlineMs;
  const running: number | undefined = project.configuration.observation?.running;
  const queueRunning: number = project.observations.running;
  const queueLimit: number = project.observations.limits.running;
  void directory; void provider; void model; void deadline; void running; void queueRunning; void queueLimit;
}
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
