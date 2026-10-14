import type { SessionStatus } from 'tenet';
import { display } from '../decision/evidence.js';

export function liveJudgeDisclosure({ judge, configuration }: Pick<SessionStatus, 'judge' | 'configuration'>): string {
  const implementation = judge.provider === 'apus-llamacpp' ? 'APUS llama.cpp' : judge.provider === 'system-one' ? 'System One' : judge.provider === 'injected' ? 'injected judge' : judge.provider;
  return `Judge ${implementation}${judge.experimental ? ' experimental' : ''}; requested model ${display(judge.requestedModel ?? 'unknown')}; origin ${display(judge.requestedDestination ?? 'unknown')}; transport ${judge.transportContract ?? 'unknown'}; authentication ${judge.authentication ?? 'unknown'}; judge source ${configuration.sources.judge ?? 'unknown'}; local availability ${judge.availability}; connectivity unverified. settings ${configuration.source}; ${configuration.settings}; deadline ${configuration.deadlineMs ?? 'unavailable'}ms (${configuration.sources.deadlineMs ?? 'unknown'}); queue ${JSON.stringify(configuration.observation)}; queue sources ${JSON.stringify(configuration.sources.observation)}.`;
}
