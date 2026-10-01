import { validationMessages, validationIssue } from '../decision/response-validation.js';
import { classifyFinding, categoryLabels, type FindingCategory } from '../decision/finding-triage.js';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { display } from '../decision/evidence.js';
import type { OwnerReport as SharedOwnerReport, Activation, Mode } from 'tenet';
import type { GuardBoundary } from './boundary.js';
import { recoverReport, recoverExecution } from './report-history.js';
import { INTEGRITY_ID, INTEGRITY_TEXT } from '../decision/policy.js';
export type OwnerReport = { -readonly [Key in keyof SharedOwnerReport]: SharedOwnerReport[Key] } & {
  execution?: 'executed' | 'failed' | 'unknown';
};
const LIMIT = 100;
const text = (value: string, max = 80) => display(value).slice(0, max);
const ruleReference = (report: OwnerReport, id: string, preview = false): string => {
  const rule = report.rules.find(r => r.id === id);
  const label = rule ? `line ${rule.line} ${rule.enforcement}` : id === INTEGRITY_ID ? 'built-in policy integrity BLOCK' : 'unknown rule';
  const content = rule?.text ?? (id === INTEGRITY_ID ? INTEGRITY_TEXT : 'Rule text unavailable in this record.');
  const safe = display(content);
  return `${label}: ${preview && safe.length > 64 ? safe.slice(0, 61) + '...' : safe}`;
};

/** Owner-only UI, never messages, tools, or evaluator evidence. */
export class OwnerReports {
  private recent: OwnerReport[] = [];
  private pending = new Map<string, OwnerReport>();
  private evicted = 0;
  private coverage = 'not-started';
  constructor(private mode: Mode, private boundary: GuardBoundary, private activation: { read(): Activation; write(value: 'on' | 'off'): Promise<Activation> },
    private captureEnabled: () => boolean, private changed: (ctx: ExtensionContext) => void,
    private adapterCoverage: () => string = () => 'unverified',
    private observationHealth: () => { completed: number; unavailable: number; dropped: number; cancelled: number; limits: { running: number; waiting: number; bytes: number; ageMs: number } } = () => ({ completed: 0, unavailable: 0, dropped: 0, cancelled: 0, limits: { running: 2, waiting: 32, bytes: 1048576, ageMs: 5000 } })) {}

  register(pi: ExtensionAPI): void {
    pi.registerCommand('tenet', { description: 'TENET findings and global on/off/status', handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const command = args.trim();
      if (command) {
        if (command === 'status') { this.status(ctx); ctx.ui.notify(this.summary(), 'info'); return; }
        if (command !== 'on' && command !== 'off') { ctx.ui.notify('Usage: /tenet [status|on|off]', 'error'); return; }
        try {
          await this.activation.write(command);
          this.changed(ctx);
          ctx.ui.notify(this.summary(), 'info');
        } catch {
          this.status(ctx);
          ctx.ui.notify('TENET control update failed. Run /tenet status to check the effective state.', 'error');
        }
        return;
      }
      try {
        const reports = [...this.recent, ...this.pending.values()].reverse();
        const items = reports.map((r, i) => {
          const ids = [...new Set([...r.diagnostics.map(d => d.ruleId), ...r.approvalRules, ...r.ruleIds])];
          const rules = ids.map(id => ruleReference(r, id, true)).join(' | ');
          return `${i + 1}. ${this.categories(r).map(c => categoryLabels[c]).join(', ') || r.assessmentStatus || 'Category not recorded'} | ${rules || text(r.reason)} | ${text(r.toolName, 20)} ${text(r.callId, 24)} | ${r.outcome} / would ${r.wouldDecision ?? 'unknown'} | assessment ${r.assessmentStatus ?? (r.assessmentAvailable ? 'completed' : 'unavailable')}`;
        });
        const selected = await ctx.ui.select(`${this.label()} | ${this.coverage} | ${this.evicted} evicted`, items.length ? items : ['No recent concerns recorded.']);
        const report = reports[items.indexOf(selected ?? '')];
        if (report) await ctx.ui.select('TENET finding | Esc to close', this.details(report));
      } catch { this.boundary.attempt(() => { throw new Error('owner-ui-unavailable'); }); }
    } });
  }

  reset(coverage: string): void { this.recent = []; this.pending.clear(); this.evicted = 0; this.coverage = coverage; }
  setCoverage(coverage: string): void { this.coverage = coverage; }
  restore(entries: readonly unknown[] | undefined): void {
    this.recent = []; this.pending.clear(); this.evicted = 0;
    for (const entry of entries ?? []) {
      const report = recoverReport(entry);
      if (report) this.add(report);
      else { const execution = recoverExecution(entry); if (execution) this.markExecution(execution.invocationId, execution.outcome, execution); }
    }
    for (const entry of entries ?? []) {
      if (!entry || typeof entry !== 'object' || (entry as any).type !== 'custom' || (entry as any).customType !== 'tenet') continue;
      const d = (entry as any).data;
      if (!d || typeof d.invocationId !== 'string') continue;
      if (d.stage === 'decision' && ['ALLOW', 'ASK', 'BLOCK'].includes(d.decision)) {
        const report = this.pending.get(d.invocationId) ?? this.recent.findLast(r => r.invocationId === d.invocationId);
        if (report?.mode === 'observe') {
          const restored = recoverReport({ type: 'custom', customType: 'tenet', data: { ...report,
            version: 3, stage: 'permission', wouldDecision: d.decision, reason: d.reason,
            ruleIds: d.ruleIds, diagnostics: d.diagnostics, assessmentAvailable: true } });
          if (restored) Object.assign(report, restored, { execution: report.execution, assessmentStatus: report.assessmentStatus });
        }
      }
      if (d.stage === 'assessment-status' && ['pending', 'completed', 'unavailable', 'dropped', 'cancelled'].includes(d.status)) {
        this.markAssessment(d.invocationId, d.status, undefined, typeof d.reason === 'string' ? d.reason : undefined);
        const report = this.recent.findLast(r => r.invocationId === d.invocationId);
        const issue = validationIssue(d.validationIssue);
        if (report && d.status === 'unavailable' && d.reason === 'invalid-response' && issue) report.validationIssue = issue;
      }
    }
  }

  private categories(report: OwnerReport): FindingCategory[] {
    return classifyFinding({ assessmentStatus: report.assessmentStatus ?? (report.assessmentAvailable ? 'validated' : 'failed'), reason: report.reason,
      rules: report.diagnostics.map(d => ({ ruleId: d.ruleId, outcome: d.outcome, gates: d.gates })), approvalRules: report.approvalRules });
  }

  private retain(report: OwnerReport): void {
    this.recent.push(report);
    if (this.recent.length > LIMIT) { this.recent.shift(); this.evicted++; }
  }
  private concern(report: OwnerReport): boolean {
    return report.wouldDecision !== 'ALLOW' || !!report.diagnostics.length || !!report.approvalRules.length;
  }
  add(report: OwnerReport): void {
    // A prepared permission can be superseded by the SDK's final revalidation.
    this.pending.delete(report.invocationId);
    const previous = this.recent.findIndex(r => r.invocationId === report.invocationId);
    if (previous !== -1) this.recent.splice(previous, 1);
    const copy = structuredClone({ ...report, assessmentStatus: report.assessmentStatus ?? (report.reason === 'assessment-pending' ? 'pending' : report.assessmentAvailable ? 'completed' : 'unavailable') });
    if (copy.assessmentStatus === 'pending') { this.pending.set(copy.invocationId, copy); return; }
    if (copy.assessmentStatus === 'completed' && !this.concern(copy)) return;
    this.retain(copy);
  }
  markAssessment(invocationId: string, status: NonNullable<OwnerReport['assessmentStatus']>, permission?: SharedOwnerReport, reason?: string): void {
    const report = this.pending.get(invocationId) ?? this.recent.findLast(r => r.invocationId === invocationId);
    if (!report) return;
    if (status === 'pending') return;
    this.pending.delete(invocationId);
    report.assessmentStatus = status;
    if (permission && (status === 'completed' || status === 'unavailable')) Object.assign(report, permission, { outcome: report.outcome, assessmentStatus: status });
    else if (reason) report.reason = reason;
    if (status === 'completed' && !this.concern(report)) return;
    if (!this.recent.includes(report)) this.retain(report);
  }
  cancelPending(): void {
    for (const report of this.pending.values()) { report.assessmentStatus = 'cancelled'; report.reason = 'tenet-off'; this.retain(report); }
    this.pending.clear();
  }
  markExecution(invocationId: string, outcome: 'executed' | 'failed' | 'unknown', identity?: Pick<OwnerReport, 'callId' | 'toolName' | 'mode'>): void {
    const report = this.pending.get(invocationId) ?? this.recent.findLast(r => r.invocationId === invocationId && (!identity ||
      r.callId === identity.callId && r.toolName === identity.toolName && r.mode === identity.mode));
    if (report) report.execution = outcome;
  }

  private label(): string {
    const state = this.activation.read();
    return state === 'off' ? 'TENET OFF' : state === 'unavailable' ? 'TENET CONTROL UNAVAILABLE' : `TENET ON ${this.mode.toUpperCase()}`;
  }
  private summary(): string {
    const h = this.observationHealth();
    const unavailable = this.recent.filter(r => r.assessmentStatus === 'unavailable').length;
    return `${this.label()} | base ${this.mode.toUpperCase()} | policy ${this.coverage} | capture ${this.activation.read() === 'on' && this.captureEnabled() ? 'ON' : 'OFF'} | observation ${this.pending.size} pending, ${h.completed} completed, ${Math.max(unavailable, h.unavailable)} unavailable, ${h.dropped} dropped, ${h.cancelled} cancelled total; limits ${h.limits.running} running/${h.limits.waiting} waiting/${h.limits.bytes} bytes/${h.limits.ageMs}ms | adapter ${this.adapterCoverage()}`;
  }
  status(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const unavailable = this.recent.filter(r => r.assessmentStatus === 'unavailable' || !r.assessmentStatus && !r.assessmentAvailable).length;
    const reports = [...this.recent, ...this.pending.values()];
    const counts = (Object.keys(categoryLabels) as FindingCategory[])
      .map(c => `${reports.filter(r => this.categories(r).includes(c)).length} ${categoryLabels[c].toLowerCase()}`);
    this.boundary.attempt(() => ctx.ui.setStatus('tenet',
      `${this.summary()} | ${this.recent.filter(r => r.assessmentStatus === 'completed' && this.concern(r)).length} concerns | ${unavailable} unavailable | ${this.recent.length + this.pending.size} distinct calls (categories overlap: ${counts.join(', ')}) | ${this.evicted} evicted`
      + (this.boundary.failures ? ` | ${this.boundary.failures} reporting errors` : '')));
  }

  private details(report: OwnerReport): string[] {
    const reference = (id: string) => ruleReference(report, id);
    const rows = (value: string) => {
      const width = Math.max(12, Math.min(72, (process.stdout.columns || 80) - 8));
      const chars = Array.from(value);
      return Array.from({ length: Math.ceil(chars.length / width) }, (_, i) => chars.slice(i * width, (i + 1) * width).join(''));
    };
    return [
      `Mode: ${report.mode.toUpperCase()}`, `Tool: ${text(report.toolName)}`, `Call: ${text(report.callId)}`,
      `Assessment profile: ${report.profile ?? 'legacy (historical)'}`,
      `Judge questions: ${report.questionVersion ?? 'not recorded'}`,
      `TENET permission: ${report.outcome}`, `Would enforce: ${report.wouldDecision}`,
      `Finding categories: ${this.categories(report).map(c => categoryLabels[c]).join(', ') || 'not recorded'} (may overlap)`,
      `Assessment: ${report.assessmentStatus ?? (report.assessmentAvailable ? 'completed' : 'unavailable')}`, `Reason: ${text(report.reason)}`,
      ...(report.validationIssue ? rows(`${report.validationIssue}: ${validationMessages[report.validationIssue]}`) : []),
      'Permission is not proof of execution.',
      `Observed execution: ${report.execution ?? 'unknown'}`,
      ...report.diagnostics.flatMap(d => [...rows(reference(d.ruleId)), `${d.outcome}: p=${d.outcomeProbability} threshold=${d.effectThreshold}`,
        ...(d.evidence === null ? ['Evidence score absent; evidence-confidence gate not evaluated.']
          : [`${d.evidence}: P(SUFFICIENT)=${d.evidenceProbability}`, `Evidence threshold: ${d.evidenceThreshold}`]), ...d.gates]),
      ...report.approvalRules.flatMap(id => rows(`${reference(id)} APPROVAL_REQUIRED`)),
    ];
  }
}
