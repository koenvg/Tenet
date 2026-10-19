import { forkPose, forkTrace } from './fork-model.js';
import { dataText } from './policy-story.js';
import type { BindScene } from './use-policy-playback.js';

export const bindFork: BindScene = root => {
  const circuit = root.querySelector<SVGSVGElement>('.fork-circuit')!;
  const without = root.querySelector<SVGPathElement>('[data-fork-trace="without"]')!;
  const withTenet = root.querySelector<SVGPathElement>('[data-fork-trace="with"]')!;
  const stop = root.querySelector<SVGPathElement>('[data-fork-stop]')!;
  const impact = root.querySelector<SVGPathElement>('[data-fork-impact]')!;
  const unguardedTip = root.querySelector<SVGPathElement>('[data-fork-tip="without"]')!;
  const data = root.querySelector<HTMLElement>('.fork-data-without')!;
  const outcome = root.querySelector<HTMLElement>('.fork-outcome-without')!;
  const verdict = root.querySelector<HTMLElement>('.fork-verdict')!;
  const outcomeWith = root.querySelector<HTMLElement>('.fork-outcome-with')!;
  return {
    observed: circuit,
    clockTarget: circuit,
    paint(frame) {
      const pose = forkPose(frame);
      const unguarded = forkTrace('without', pose.without);
      const guarded = forkTrace('with', pose.with);
      without.setAttribute('d', unguarded.path);
      withTenet.setAttribute('d', guarded.path);
      unguardedTip.setAttribute('d', unguarded.tip);
      unguardedTip.setAttribute('visibility', pose.without > 0 ? 'visible' : 'hidden');
      stop.setAttribute('d', guarded.tip);
      stop.setAttribute('visibility', pose.with > 0 ? 'visible' : 'hidden');
      data.style.clipPath = pose.erasure > 0 ? `inset(0 0 0 ${pose.erasure * 100}%)` : 'none';
      impact.setAttribute('opacity', String(pose.impact));
      impact.setAttribute('transform', `translate(750 190) scale(${1 + (1 - pose.impact) * 0.6}) translate(-750 -190)`);
      const text = dataText(pose.data);
      if (data.textContent !== text) data.textContent = text;
      const result = pose.data === 'intact' ? 'Data intact' : pose.data === 'empty' ? 'Would empty data' : 'Would remove file';
      if (outcome.textContent !== result) outcome.textContent = result;
      const decision = pose.arrived ? 'Would block' : 'Your rule';
      if (verdict.textContent !== decision) verdict.textContent = decision;
      const preserved = pose.arrived ? 'Data stays intact' : 'Data intact';
      if (outcomeWith.textContent !== preserved) outcomeWith.textContent = preserved;
      root.dataset.forkArrival = pose.arrived ? 'blocked' : pose.data === 'intact' ? 'approaching' : 'lost';
    },
  };
};
