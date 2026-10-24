import { ruleUIFixture, rule, common } from './rule-ui-fixture.js';
import { makeView } from './fixtures.js';
import type { RuleStatus } from '../../../src/inspector/session-rules-model.js';
export const fixedWording = 'Do not directly use write/edit tools. Delegate those actions.';
export function fixedRuleFixture(options: { status?: RuleStatus; checks?: number } = {}) {
  const f = ruleUIFixture(options);
  const view = makeView({ callId: 'exact' });
  const item = { ...f.item, preview: fixedWording, declarationRevision: 'declaration-only', representative: { ...f.item.representative, revision: 'invocation-only' } };
  const data = (url: URL) => ({ ...common, ...f.data(url),
    ...(url.pathname.endsWith('/rules') ? { items: [item] } : {}),
    ...(url.pathname.endsWith(`/rules/${rule}`) ? { rule: item, wording: { state: 'available', text: fixedWording } } : {}),
    ...(url.pathname.includes('/invocations/') ? { view: { ...view, identity: { ...view.identity, toolName: 'delegate' } } } : {}),
  });
  f.intercept(url => Promise.resolve(Response.json(data(url))));
  return { ...f, item, fixedData: data };
}
