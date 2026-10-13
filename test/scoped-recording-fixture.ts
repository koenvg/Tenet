import { readFile } from 'node:fs/promises';
import type { JudgeRequest } from '../src/decision/contracts.js';
import { prepareJudgeScopes } from '../src/decision/judge-evidence.js';
import { APUS_V2 } from '../src/recording/native.js';
import { captureScopedPlan, captureScopedSubmission } from '../src/recording/scoped-capture.js';

import { responseSnapshot } from '../src/recording/contract.js';
import { FixtureArchiveWriter } from './archive-fixture.js';
import { answer } from './helpers.js';

export const scopedIdentity = { host: 'pi', contextId: 'main', sessionId: 'scoped-fixture', invocationId: 'read-00',
  callId: 'read-00', toolName: 'read', cwd: '/synthetic', mode: 'observe' as const, bbThreadId: 'thr_scopedfixture' };
export async function scopedFixture() {
  const frozen = JSON.parse(await readFile(new URL('./fixtures/judge-prompts/v8-read-00.json', import.meta.url), 'utf8'));
  const request: JudgeRequest = frozen.request;
  const plan = prepareJudgeScopes(request)!;
  // Authored questions demonstrate capture only. They are not production v9 instructions.
  const questions = Object.fromEntries(plan.groups.flatMap(g => g.questionKeys.map(key => [key, {
    type: 'choice' as const, instructions: `Synthetic recording fixture for ${g.kind}. Read only this state.`,
    criteria: (key.endsWith('_facts') ? { NONE: 'No verified reference.' }
      : key.endsWith('_evidence') ? { SUFFICIENT: 'Enough ordinary evidence.', INSUFFICIENT: 'A material gap.' }
      : { PASS: 'Satisfied.', FAIL: 'Violated.', UNKNOWN: 'Uncertain.', APPROVAL_REQUIRED: 'Requires confirmation.',
          ...(g.kind === 'ordinary' ? { NOT_APPLICABLE: 'Unverified ordinary finding.' } : {}) }) as Record<string, string>,
  }])));
  return { request, plan, questions };
}
export async function recordScopedFixture(directory: string, native = true) {
  const { request, plan, questions } = await scopedFixture();
  const writer = new FixtureArchiveWriter({ enabled: true, directory });
  const record = writer.bind(scopedIdentity);
  let evidenceContext: unknown;
  const sink: typeof record = (stage, data) => {
    if (stage === 'request') evidenceContext = data.evidenceContext;
    record(stage, { ...data, ...(evidenceContext ? { evidenceContext } : {}) });
  };
  sink('begin', { policy: request.policy, profile: 'applicability-v1', config: { effectThreshold: .91, evidenceThreshold: .93 } });
  captureScopedPlan(sink, request, plan, questions, { model: 'scripted-scoped', provider: native ? 'apus-llamacpp' : 'typesafe',
    ...(native ? { nativeContract: APUS_V2 } : {}) });
  for (const g of plan.groups) {
    const payload = { model: 'scripted-scoped', state: g.state as Record<string, unknown>,
      questions: Object.fromEntries(g.questionKeys.map(k => [k, questions[k]!])) };
    captureScopedSubmission(sink, { scopeId: g.id, submissionId: g.id, status: 'attempted', questionKeys: g.questionKeys, payloadJson: JSON.stringify(payload) });
    captureScopedSubmission(sink, { scopeId: g.id, submissionId: g.id, status: 'completed', questionKeys: g.questionKeys });

    if (native) {
      sink('response', { nativeContract: APUS_V2, ...responseSnapshot({ kind: 'native-request', provider: 'apus-llamacpp', scopeId: g.id,
        question: g.questionKeys[0], renderingVersion: APUS_V2.renderingVersion, chat: `Synthetic native fixture for ${g.id}`,
        mapping: { A: 'PASS', B: 'UNKNOWN' }, labelIds: { A: 32, B: 33 }, nativeRequest: { prompt: [1, 2], n_predict: 1 } }) });
      sink('response', { nativeContract: APUS_V2, ...responseSnapshot({ kind: 'native-response', provider: 'apus-llamacpp', scopeId: g.id,
        question: g.questionKeys[0], raw: { synthetic: true, content: 'A' } }) });
    }
  }
  const assessment = { ...answer(request.policy), model: 'scripted-scoped' };
  sink('validation', { valid: true, ...(native ? { nativeContract: APUS_V2 } : {}) });
  sink('assessment', { assessment, profile: 'applicability-v1', config: { effectThreshold: .91, evidenceThreshold: .93 } });
  sink('decision', { decision: 'ALLOW', reason: 'all-rules-pass' });
  sink('permission', { outcome: 'released' });
  // No execution stage: scripted recording does not run the proposed read.
  await writer.complete();
}
