import type { Action, Decision, Policy, RuleDiagnostic } from '../decision/contracts.js';
import { argumentDigest } from '../decision/evidence.js';
import { policyIsCurrent } from '../decision/policy.js';
import { confirmInvocation } from './approval.js';
import { Consequences, type Permission } from './consequences.js';
import type { Activation } from './activation.js';
import type { Mode } from './config.js';
import type { Approval, Call, InvocationIdentity, RuntimeIdentity } from './guard.js';
import type { ResolvedInvocation } from './resolved-action.js';

const scope = (identity: RuntimeIdentity) => JSON.stringify([identity.host, identity.sessionId, identity.contextId]);
type Veto = { block: true; reason: string } | undefined;
interface InvocationContext {
  scope: string;
  signal: AbortSignal;
  observationSignal: AbortSignal;
  current(): boolean;
}
interface AuthorizationOptions {
  call: Call;
  identity: InvocationIdentity & RuntimeIdentity;
  policy: Policy;
  ready(): boolean;
  unavailable(): string | undefined;
  policyStale(): void;
  approval(outcome: Approval, ruleIds: string[]): void;
  disabled(): void;
  finalized(permission: Permission): void;
}

/** Owns revocation generations and all invocations awaiting terminal permission. */
export class InvocationAuthorizations {
  private generation = new AbortController();
  private contexts = new Map<string, AbortController>();
  private pending = new Map<InvocationAuthorization, string>();

  constructor(private mode: Mode, private activation: { read(): Activation; refresh(): Activation }) {}

  context(call: Call): InvocationContext {
    const selected = scope(call);
    const generation = this.generation;
    let controller = this.contexts.get(selected);
    if (!controller) { controller = new AbortController(); this.contexts.set(selected, controller); }
    const observationSignal = AbortSignal.any([generation.signal, controller.signal]);
    const signal = AbortSignal.any([observationSignal, ...(call.signal ? [call.signal] : [])]);
    return { scope: selected, signal, observationSignal,
      current: () => !(this.mode === 'observe' ? observationSignal : signal).aborted
        && generation === this.generation && controller === this.contexts.get(selected) };
  }

  begin(context: InvocationContext, options: AuthorizationOptions): InvocationAuthorization {
    const invocation = new InvocationAuthorization(this.mode, this.activation, context, options,
      () => this.pending.delete(invocation));
    this.pending.set(invocation, context.scope);
    return invocation;
  }

  invalidate(reason: string, identity?: RuntimeIdentity): void {
    const selected = identity ? scope(identity) : undefined;
    // Revoke every affected lease before terminal callbacks can run.
    if (selected) {
      this.contexts.get(selected)?.abort(reason);
      this.contexts.set(selected, new AbortController());
    } else {
      this.generation.abort(reason);
      this.generation = new AbortController();
      for (const controller of this.contexts.values()) controller.abort(reason);
      this.contexts.clear();
    }
    for (const [invocation, context] of this.pending) {
      if (!selected || context === selected) invocation.block(reason);
    }
  }
}

/** One invocation's approval, revalidation and exactly-once permission finalizer. */
class InvocationAuthorization {
  private consequences: Consequences;
  private terminal?: Permission;

  constructor(private mode: Mode, private activation: { read(): Activation; refresh(): Activation },
    private context: InvocationContext, private options: AuthorizationOptions, private detach: () => void) {
    this.consequences = new Consequences(mode, options.policy);
  }

  current = (): boolean => this.activation.refresh() === 'on' && this.context.current() && this.options.ready();
  assessed(result: Decision): void { this.consequences.assessed(result); }

  commit(permission: Permission): Permission {
    if (this.terminal) return this.terminal;
    this.terminal = permission;
    this.detach();
    if (this.activation.read() === 'on') this.options.finalized(permission);
    return permission;
  }

  private finish(failure?: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[], preserveAsk = false): Veto {
    const state = this.activation.refresh();
    if (state !== 'on') failure = state === 'off' ? 'tenet-off' : 'control-unavailable';
    const permission = this.consequences.permission(failure, ruleIds, diagnostics);
    if (preserveAsk && failure === 'approval-unavailable') permission.wouldDecision = 'ASK';
    return this.consequences.veto(this.commit(permission));
  }

  block = (reason: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[], preserveAsk = false): Veto => {
    if (reason === 'tenet-off' || reason === 'control-unavailable') this.options.disabled();
    return this.finish(reason, ruleIds, diagnostics, preserveAsk);
  };

  async policyCurrent(): Promise<boolean> {
    return this.options.policy.available && await this.fresh(this.options.policy);
  }

  private async fresh(policy: Extract<Policy, { available: true }>): Promise<boolean> {
    const upToDate = await policyIsCurrent(policy);
    if (!this.current()) return false;
    if (upToDate) return true;
    this.options.policyStale();
    this.options.call.onPolicyStale?.();
    return false;
  }

  async authorize(action: Action, resolved: ResolvedInvocation, result: Decision,
    approval: { timeoutMs: number; trusted: boolean }): Promise<Veto> {
    const { call, identity, policy } = this.options;
    if (!policy.available) return this.block('policy-unavailable');
    const fresh = () => this.fresh(policy);
    if (!await fresh()) return this.block('policy-stale');
    if (result.decision === 'BLOCK') return this.block(result.reason, result.ruleIds, result.diagnostics);
    const unchanged = () => {
      const now = call.current();
      return now.host === identity.host && now.sessionId === identity.sessionId && now.contextId === identity.contextId && now.toolName === identity.toolName
        && now.callId === identity.callId && argumentDigest(now.input) === action.argumentDigest;
    };
    if (!unchanged()) return this.block('arguments-changed');
    if (result.decision === 'ASK' && this.mode === 'enforce') {
      if (!approval.trusted || !call.approve) return this.block('approval-unavailable', result.ruleIds, result.diagnostics, true);
      const outcome = await confirmInvocation({ policy, action, ruleIds: result.ruleIds,
        timeoutMs: approval.timeoutMs, signal: this.context.signal,
        valid: async () => this.current() && unchanged() && await fresh() && this.current() && unchanged() }, call.approve);
      if (!this.current()) return this.block('guard-state-changed');
      this.options.approval(outcome, result.ruleIds);
      if (outcome !== 'approved') return this.block(`approval-${outcome}`);
    }
    if (result.decision === 'ASK' && !await fresh()) return this.block('policy-stale');
    if (!this.current()) return this.block('guard-state-changed');
    if (!unchanged()) return this.block('arguments-changed');
    if (!await resolved.revalidate(this.context.signal)) return this.block('action-resolution-stale');
    if (!await fresh()) return this.block('policy-stale');
    if (!this.current()) return this.block('guard-state-changed');
    if (!unchanged()) return this.block('arguments-changed');
    if (call.onAuthorization) {
      const bound = () => !this.terminal && this.current() && unchanged() && this.current();
      call.onAuthorization({
        revalidate: async () => bound() && await fresh() && bound()
          && await resolved.revalidate(this.context.signal) && await fresh() && bound(),
        current: bound,
        commit: release => {
          if (!this.terminal) {
            try { this.finish(release && bound() ? undefined : this.options.unavailable() ?? 'guard-state-changed'); }
            catch { this.finish('guard-error'); }
          }
          return this.terminal!;
        },
      });
      // Preparation is not permission. The lifecycle owner retains this invocation until commit.
      try { call.onPermission?.(identity, this.consequences.permission()); } catch { /* Best effort. */ }
      return undefined;
    }
    return this.finish();
  }
}
