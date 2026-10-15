import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openScopedAssessment } from '../src/decision/assessment-answers.js';
import type { JudgeRequest } from '../src/decision/contracts.js';
import type { ScopedQuestions } from '../src/recording/scoped.js';
import frozen from './fixtures/judge-prompts/v8-read-00.json' with { type: 'json' };

const request = { ...frozen.request, deadlineMs: 5000 } as unknown as JudgeRequest;
const model = 'scripted-model';
const choice = (criteria: Record<string, string>) => {
  const selected = Object.keys(criteria)[0]!;
  return { type: 'choice', choice: selected, confidence: 1,
    probabilities: Object.fromEntries(Object.keys(criteria).map(label => [label, label === selected ? 1 : 0])) };
};
const reply = (questions: ScopedQuestions) => ({ model,
  answers: Object.fromEntries(Object.entries(questions).map(([key, q]) => [key, choice(q.criteria)])) });

test('grouped acceptance waits for commit and assembles only after every scope', () => {
  const session = openScopedAssessment(request), ordinary = session.current()!;
  assert.equal(ordinary.group.id, 'ordinary:0');
  const staged = ordinary.stage(reply(ordinary.questions));
  assert.equal(staged.model, 'scripted-model');
  assert.equal(session.current()!.group.id, 'ordinary:0');
  staged.commit();
  const facts = session.current()!;
  assert.equal(facts.group.id, 'exemption:0');
  assert.deepEqual(Object.keys(facts.questions), ['rule_0_facts']);
  facts.stage(reply(facts.questions)).commit();
  const protection = session.current()!;
  assert.equal(protection.group.id, 'policy-protection');
  protection.stage(reply(protection.questions)).commit();
  const assessment = session.finish(model);
  assert.equal(assessment.model, 'scripted-model');
  assert.deepEqual(assessment.rules.map(r => [r.ruleId, r.outcome.choice]), [
    ['project:95cda1080ca009008ae6c799066ec5340cd16027803042e5919e02255d150f03:1', 'PASS'], ['builtin:policy-integrity', 'PASS'],
  ]);
  assert.equal(session.current(), undefined);
});

test('individual acceptance keeps the scope pending until its evidence answer succeeds', () => {
  const session = openScopedAssessment(request), ordinary = session.current()!;
  ordinary.acceptAnswer('rule_0_outcome', model, choice(ordinary.questions.rule_0_outcome!.criteria));
  assert.equal(session.current()!.group.id, 'ordinary:0');
  ordinary.acceptAnswer('rule_0_evidence', model, choice(ordinary.questions.rule_0_evidence!.criteria));
  assert.equal(session.current()!.group.id, 'exemption:0');
  assert.equal(session.current()!.factsKey, 'rule_0_facts');
});

test('an incomplete grouped reply ends the session without permitting later work or assembly', () => {
  const session = openScopedAssessment(request), ordinary = session.current()!;
  const raw = reply(ordinary.questions);
  delete raw.answers.rule_0_evidence;
  assert.throws(() => ordinary.stage(raw), { reason: 'invalid-response' });
  assert.throws(() => session.current(), { reason: 'invalid-response' });
  assert.throws(() => ordinary.stage(reply(ordinary.questions)), { reason: 'invalid-response' });
  assert.throws(() => session.finish(model), { reason: 'invalid-response' });
});

test('a completed grouped reply cannot be committed twice or reused for a later scope', () => {
  const session = openScopedAssessment(request), ordinary = session.current()!;
  const staged = ordinary.stage(reply(ordinary.questions));
  staged.commit();
  assert.equal(session.current()!.group.id, 'exemption:0');
  assert.throws(() => staged.commit(), { reason: 'invalid-response' });
  assert.throws(() => session.current(), { reason: 'invalid-response' });
});

for (const misuse of ['out-of-order', 'mixed-acceptance', 'early-assembly'] as const) test(`${misuse} cannot bypass pending scope answers`, () => {
  const session = openScopedAssessment(request), ordinary = session.current()!;
  assert.equal(ordinary.group.id, 'ordinary:0');
  if (misuse === 'out-of-order') {
    assert.throws(() => ordinary.acceptAnswer('rule_0_evidence', model, choice(ordinary.questions.rule_0_evidence!.criteria)),
      { reason: 'invalid-response' });
  } else {
    ordinary.acceptAnswer('rule_0_outcome', model, choice(ordinary.questions.rule_0_outcome!.criteria));
    assert.equal(session.current()!.group.id, 'ordinary:0');
    if (misuse === 'mixed-acceptance') assert.throws(() => ordinary.stage(reply(ordinary.questions)), { reason: 'invalid-response' });
    else assert.throws(() => session.finish(model), { reason: 'invalid-response' });
  }
  assert.throws(() => session.current(), { reason: 'invalid-response' });
});
