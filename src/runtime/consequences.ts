import type { Decision, Policy, RuleDiagnostic } from '../decision/contracts.js';
import type { Mode } from './config.js';
import { ASSESSMENT_METADATA } from '../decision/assessment-contract.js';

export interface Permission {
  /** Recorded contract identity; historical reports may contain older values. */
  profile?: string;
  questionVersion?: string;
  outcome: 'released' | 'blocked';
  wouldDecision?: Decision['decision'];
  reason: string;
  assessmentAvailable: boolean;
  ruleIds: string[];
  diagnostics: RuleDiagnostic[];
  validationIssue?: Decision['validationIssue'];
  rules: { id: string; line: number; enforcement: 'BLOCK' | 'WARN'; text?: string }[];
  approvalRules: string[];
}

/** One invocation's evidence and consequences. Observation never returns a veto. */
export class Consequences {
  private assessment: Decision | undefined;
  constructor(readonly mode: Mode, private policy: Policy) {}

  assessed(result: Decision): void { this.assessment = result; }

  permission(failure?: string, ruleIds?: string[], diagnostics?: RuleDiagnostic[]): Permission {
    const result = this.assessment;
    const wouldDecision = failure ? (this.mode === 'observe' ? undefined : 'BLOCK') : result?.decision ?? (this.mode === 'observe' ? undefined : 'BLOCK');
    return {
      ...ASSESSMENT_METADATA,
      outcome: this.mode === 'enforce' && failure ? 'blocked' : 'released',
      wouldDecision, reason: failure ?? result?.reason ?? 'guard-error',
      assessmentAvailable: !!result?.assessment,
      ruleIds: ruleIds ?? result?.ruleIds ?? [], diagnostics: diagnostics ?? result?.diagnostics ?? [],
      ...(result?.validationIssue ? { validationIssue: result.validationIssue } : {}),
      rules: this.policy.available ? this.policy.rules.map(({ id, line, enforcement, text }) => ({ id, line, enforcement, text })) : [],
      approvalRules: result?.assessment?.rules.filter(r => r.outcome.choice === 'APPROVAL_REQUIRED').map(r => r.ruleId) ?? [],
    };
  }

  location(id: string): string {
    const rule = this.policy.available && this.policy.rules.find(r => r.id === id);
    return rule ? `line ${rule.line}` : 'built-in policy integrity';
  }

  veto(permission: Permission): { block: true; reason: string } | undefined {
    if (permission.outcome !== 'blocked') return undefined;
    const locations = permission.ruleIds.map(id => this.location(id));
    // WARN findings are owner-only even when another rule blocks the invocation.
    const details = permission.diagnostics.filter(d => d.enforcement === 'BLOCK').map(d =>
      `${this.location(d.ruleId)}: ${d.gates.join(', ')}; outcome=${d.outcome} p=${d.outcomeProbability} threshold=${d.effectThreshold}; `
      + (d.evidence === null ? 'evidence score absent; evidence-confidence gate not evaluated'
        : `evidence=${d.evidence} p(SUFFICIENT)=${d.evidenceProbability} threshold=${d.evidenceThreshold}`)).join('\n');
    return { block: true, reason: `TENET blocked: ${permission.reason}.${locations.length ? ` Rules: ${locations.join(', ')}.` : ''}`
      + (permission.reason === 'policy-stale' ? ' Reload or restart to load the changed policy.' : '') + (details ? `\n${details}` : '') };
  }
}
