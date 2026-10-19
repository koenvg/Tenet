import type { PolicyRouteIndex } from './policy-routes.js';

export const phases = {
  before: { duration: 1400, next: 'lost' },
  lost: { duration: 1600, next: 'installing' },
  installing: { duration: 700, next: 'after' },
  after: { duration: 1400, next: 'blocked' },
  blocked: { duration: 1900, next: 'before' },
} as const;
export type Phase = keyof typeof phases;
export type StoryFrame = Readonly<{ route: PolicyRouteIndex; phase: Phase; progress: number }>;
export type DataState = 'intact' | 'empty' | 'removed';
export const sampleData = '[\n  { "id": "example" }\n]';
const losses = ['empty', 'removed', 'removed', 'removed'] as const;
export const lossFor = (route: PolicyRouteIndex): DataState => losses[route];
export const dataText = (data: DataState) => data==='intact'?sampleData:data==='empty'?'[]':'File removed';
export function nextStep(route: PolicyRouteIndex, phase: Phase): { route: PolicyRouteIndex; phase: Phase } {
  return { route: phase === 'blocked' ? ((route + 1) % 4) as PolicyRouteIndex : route, phase: phases[phase].next };
}
