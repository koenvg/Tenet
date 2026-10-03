import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { freeze } from '../src/decision/evidence.js';
import { boundEvidence, judgeState } from '../src/decision/judge-evidence.js';
import { buildQuestions } from '../src/decision/questions.js';
import { DEFAULTS, MODEL, QUESTION_VERSION } from '../src/decision/decide.js';
import type { JudgeRequest, Trajectory, Action } from '../src/decision/contracts.js';
import type { ResolvedAction } from '../src/runtime/resolved-action.js';
import fixtures from './evidence-selection/fixtures.json' with { type: 'json' };
import report from './evidence-selection/report.json' with { type: 'json' };

export const FOLLOWUP_BASE = 'a12fedee37e0c712130836469153776591912c0a';
export const IMPLEMENTATION_BASE = '29fdd5e0f21f6c7ddc11b5538b26788e034c1676';
export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const digest = (value: unknown) => sha256(JSON.stringify(value));
const pins = {
  'fixtures.json': '6179d54bb77c588bb5e97b2631c4b6f77348eed840b0162a8d985ab15c5f8308',
  'report.json': 'c181d801f886dd84d0f4ecb7e161e21dea53d1cb6c9ab1ac88c3763c7857257b',
  'report.md': '05a2bf3ba726313473e7f3faf3c97eecfc65a3a664a891308356b9ffb05e94dd',
};
const eligible = ['exact-inspection', 'anchored-inspection', 'oversized-identical', 'renamed-inspection',
  'read-prohibited', 'transmit-prohibited', 'mutation-prohibited', 'benign-read', 'approval', 'context-retained',
  'context-lost', 'compound', 'opaque', 'policy-mutation', 'forged-facts', 'stale-facts', 'historical-forgery'];
export type Side = 'baseline' | 'candidate';
export type FrozenRow = typeof report.pairs[number]['baseline'];
export type Entry = {
  index: number; id: string; side: Side; expected: typeof fixtures.fixtures[number]['expected'];
  payload: FrozenRow['payload']; payloadDigest: string; requestBytes: number; request: JudgeRequest;
  policyDigest: string; questionDigest: string;
  representationVersion: string; selectorVersion: string | null; history: FrozenRow['history'];
};
function equal(a: unknown, b: unknown): void {
  if (digest(a) !== digest(b)) throw Error('frozen-input-drift');
}

/** Fixed synthetic corpus only. No arbitrary payload, policy, fixture or model input. */
export function prepareEvidenceManifest(read: (url: URL) => Buffer = readFileSync) {
  for (const [name, hash] of Object.entries(pins)) {
    if (sha256(read(new URL(`./evidence-selection/${name}`, import.meta.url))) !== hash) throw Error('frozen-input-drift');
  }
  equal(fixtures.fixtures.map(f => f.id), [...eligible, 'provider-unavailable', 'invalid-assessment', 'skipped-assessment']);
  equal(report.pairs.map(p => p.id), fixtures.fixtures.map(f => f.id));
  equal(digest(fixtures), report.fixtureDigest);
  if (MODEL !== 'jev-latest' || QUESTION_VERSION !== 'policy-rules-v7-evidence-selection') throw Error('contract-drift');
  const entries: Entry[] = [];
  for (const [i, f] of fixtures.fixtures.entries()) {
    const pair = report.pairs[i]!;
    equal(digest(f), pair.fixtureDigest);
    equal(sha256(f.policyText), pair.policyDigest);
    equal(f.expected, pair.expected);
    for (const side of ['baseline', 'candidate'] as const) {
      const row = pair[side], state = row.payload.state;
      const request: JudgeRequest = {
        profile: 'applicability-v1', policy: { ...state.policy, available: true, rules: state.policy.rules.map(r => ({ ...r, enforcement: 'BLOCK' as const })) },
        action: state.action as unknown as Action, cwd: state.context.cwd, resolvedAction: state.resolvedAction as ResolvedAction,
        deadlineMs: DEFAULTS.deadlineMs, trajectory: state.trajectory as Trajectory,
      };
      equal(row.thresholds, DEFAULTS);
      equal(row.profile, 'applicability-v1');
      equal(row.questionVersion, QUESTION_VERSION);
      equal(row.questionDigest, digest(row.payload.questions));
      equal(row.payload, { model: MODEL, state: judgeState(request), questions: buildQuestions(request.policy, request.resolvedAction) });
      equal(row.payloadDigest, digest(row.payload));
      equal(row.requestBytes, Buffer.byteLength(JSON.stringify(row.payload), 'utf8'));
      for (const key of ['policy', 'action', 'context', 'integrity', 'resolvedAction', 'profile'] as const) equal(pair.baseline.payload.state[key], state[key]);
      if (side === 'candidate') {
        const current = boundEvidence({ ...request, trajectory: { observations: f.history, omitted: 0,
          limitations: ['authored-capture-eligible-event-count-unknown'] } as Trajectory }, f.limits);
        if (!current) throw Error('candidate-capacity');
        equal(judgeState(current), row.payload.state);
      }
      if (i < 17) entries.push({ index: entries.length, id: f.id, side, expected: f.expected,
        payload: row.payload as FrozenRow['payload'], payloadDigest: row.payloadDigest, requestBytes: row.requestBytes,
        request, representationVersion: row.representationVersion, selectorVersion: row.selectorVersion,
        policyDigest: pair.policyDigest, questionDigest: row.questionDigest,
        history: row.history as FrozenRow['history'] });
    }
  }
  return freeze({ version: 'evidence-live-manifest-v1', campaign: 'TENET-29-bdc51955-34', budget: 34,
    authoredCheckpoint: 'bdc51955dc522a877fd25e68740373ec0cefd133', followupBase: FOLLOWUP_BASE, implementationBase: IMPLEMENTATION_BASE,
    inputFileDigests: pins, fixtureDigest: report.fixtureDigest, endpoint: ENDPOINT, requestedModel: MODEL,
    profile: 'applicability-v1', questionVersion: QUESTION_VERSION, thresholds: DEFAULTS,
    entries, excluded: report.pairs.slice(17), denominators: { corpus: 20, corpusAuthoredProtected: 19, corpusBenign: 1, livePairs: 17, authoredProtectedLive: 16, benignLive: 1,
      authoredViolations: 7, excludedOffline: 3, excludedAuthoredProtected: 3 }, fixtureActionsExecuted: false });
}
export type Manifest = ReturnType<typeof prepareEvidenceManifest>;
