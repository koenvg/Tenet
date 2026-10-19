import { lossFor, type DataState, type StoryFrame } from './policy-story.js';

export type ForkPose = Readonly<{
  without: number;
  with: number;
  data: DataState;
  erasure: number;
  arrived: boolean;
  impact: number;
}>;

const approach = (progress: number) => {
  const time = Math.max(0, Math.min(1, (progress - 0.12) / 0.7));
  return 1 - Math.pow(1 - time, 3);
};

export function forkPose({ route, phase, progress }: StoryFrame): ForkPose {
  const without = phase === 'before' ? approach(progress) : 1;
  const guarded = phase === 'after' ? approach(progress) : phase === 'blocked' ? 1 : 0;
  const arrived = guarded === 1;
  return {
    without,
    with: guarded,
    data: phase === 'before' && progress < 1 ? 'intact' : lossFor(route),
    erasure: phase === 'before' && progress < 1 ? Math.max(0, (progress - 0.82) / 0.18) : 0,
    arrived,
    impact: phase === 'after' && arrived ? Math.max(0, 1 - (progress - 0.82) / 0.18) : 0,
  };
}

export const forkPaths = {
  without: 'M500 0 C500 100 250 34 250 144 L250 316',
  with: 'M500 0 C500 100 750 34 750 144 L750 186',
} as const;

export function forkTrace(branch: keyof typeof forkPaths, progress: number): Readonly<{ path: string; tip: string }> {
  const x = branch === 'without' ? 250 : 750;
  const end = branch === 'without' ? 316 : 186;
  const t = Math.min(1, progress / 0.7);
  const dx = x - 500;
  const headX = 500 + dx * (3 * t * t - 2 * t * t * t);
  const headY = progress < 0.7
    ? 300 * t - 498 * t * t + 342 * t * t * t
    : 144 + (end - 144) * (progress - 0.7) / 0.3;
  const curve = `M500 0 C500 ${100 * t} ${500 + dx * t * t} ${200 * t - 166 * t * t} ${headX} ${progress < 0.7 ? headY : 144}`;
  return {
    path: progress === 1 ? forkPaths[branch] : progress < 0.7 ? curve : `${curve} L${x} ${headY}`,
    tip: `M${headX} ${headY}v.01`,
  };
}
