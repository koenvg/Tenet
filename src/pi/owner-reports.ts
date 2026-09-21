import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { display } from '../decision/evidence.js';
import type { Permission } from './consequences.js';
import type { Mode } from './config.js';
import type { GuardBoundary } from './boundary.js';
import { recoverReport } from './report-history.js';
import { INTEGRITY_ID, INTEGRITY_TEXT } from '../decision/policy.js';

export interface OwnerReport extends Permission {
  mode: Mode;
  callId: string;
  toolName: string;
  invocationId: string;
}
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
  private evicted = 0;
  private coverage = 'not-started';
  constructor(private mode: Mode, private boundary: GuardBoundary) {}

  register(pi: ExtensionAPI): void {
    pi.registerCommand('tenet', { description: 'View owner-only TENET findings', handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      try {
        const reports = [...this.recent].reverse();
        const items = reports.map((r, i) => {
          const ids = [...new Set([...r.diagnostics.map(d => d.ruleId), ...r.approvalRules, ...r.ruleIds])];
          const rules = ids.map(id => ruleReference(r, id, true)).join(' | ');
          return `${i + 1}. ${rules || text(r.reason)} | ${text(r.toolName, 20)} ${text(r.callId, 24)} | ${r.outcome} / would ${r.wouldDecision}`;
        });
        const selected = await ctx.ui.select(`TENET ${this.mode.toUpperCase()} | ${this.coverage} | ${this.evicted} evicted`, items.length ? items : ['No recent concerns recorded.']);
        const report = reports[items.indexOf(selected ?? '')];
        if (report) await ctx.ui.select('TENET finding | Esc to close', this.details(report));
      } catch { this.boundary.attempt(() => { throw new Error('owner-ui-unavailable'); }); }
    } });
  }

  reset(coverage: string): void { this.recent = []; this.evicted = 0; this.coverage = coverage; }
  setCoverage(coverage: string): void { this.coverage = coverage; }
  restore(entries: readonly unknown[] | undefined): void {
    this.recent = []; this.evicted = 0;
    for (const entry of entries ?? []) {
      const report = recoverReport(entry);
      if (report) this.add(report);
    }
  }

  add(report: OwnerReport): void {
    if (report.wouldDecision === 'ALLOW' && report.assessmentAvailable && !report.diagnostics.length && !report.approvalRules.length) return;
    this.recent.push(structuredClone(report));
    if (this.recent.length > LIMIT) { this.recent.shift(); this.evicted++; }
  }

  status(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const unavailable = this.recent.filter(r => !r.assessmentAvailable).length;
    this.boundary.attempt(() => ctx.ui.setStatus('tenet',
      `TENET ${this.mode.toUpperCase()} ${this.recent.length - unavailable} concerns | ${unavailable} unavailable | ${this.coverage}`
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
      `TENET permission: ${report.outcome}`, `Would enforce: ${report.wouldDecision}`,
      `Assessment: ${report.assessmentAvailable ? 'available' : 'UNAVAILABLE'}`, `Reason: ${text(report.reason)}`,
      'Permission is not proof of execution.',
      ...report.diagnostics.flatMap(d => [...rows(reference(d.ruleId)), `${d.outcome}: p=${d.outcomeProbability} threshold=${d.effectThreshold}`,
        `${d.evidence}: P(SUFFICIENT)=${d.evidenceProbability}`, `Evidence threshold: ${d.evidenceThreshold}`, ...d.gates]),
      ...report.approvalRules.flatMap(id => rows(`${reference(id)} APPROVAL_REQUIRED`)),
    ];
  }
}
