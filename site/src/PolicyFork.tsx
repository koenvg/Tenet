import { bindFork } from './bind-fork.js';
import { forkPaths, forkPose, forkTrace } from './fork-model.js';
import { policyRoutes, policyRule } from './policy-routes.js';
import { dataText, sampleData } from './policy-story.js';
import { usePolicyPlayback } from './use-policy-playback.js';

export default function PolicyFork({ ready }: { ready: boolean }) {
  const motion = usePolicyPlayback(ready, bindFork);
  const { phase, kind } = motion.playback;
  const example = policyRoutes[motion.selected];
  const pose = forkPose({ route: motion.selected, phase, progress: kind === 'static' || kind === 'waiting' ? 1 : 0 });
  const unguarded = forkTrace('without', pose.without), guarded = forkTrace('with', pose.with);
  const label = motion.reduced
    ? phase === 'lost' ? 'Show with TENET' : 'Next example without TENET'
    : kind === 'playing' ? 'Pause comparison' : kind === 'paused' ? 'Resume comparison' : 'Play comparison';
  return <figure className="fork-demonstration" aria-labelledby="how-title" data-fork-playback={kind} data-fork-phase={phase}>
    <div className="fork-heading">
      <h2 id="how-title">1. Write your rule in <code>TENET.md</code> in plain text.</h2>
      <a className="read-more" href="https://github.com/koenvg/Tenet/blob/main/docs/policy.md#write-a-first-rule">Write your first rule <span aria-hidden="true">→</span></a>
      {ready && <button className="fork-control" type="button" aria-label={label} title={label} onClick={motion.reduced ? motion.compare : motion.toggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={motion.reduced ? 'm8 5 7 7-7 7' : kind === 'playing' ? 'M8 6v12M16 6v12' : 'm8 5 10 7-10 7Z'} /></svg>
      </button>}
    </div>
    <div className="fork-source">
      <span>Fictional tool call <span aria-hidden="true">·</span> <code>{example.call.name}</code></span>
      <pre><code className="fork-preview">{example.preview}</code></pre>
      <span className="fork-target">Target <code>production/<wbr />customers.json</code></span>
    </div>
    <div className="fork-stage" ref={motion.stage} data-fork-arrival={pose.arrived ? 'blocked' : 'lost'}>
      <div className="fork-drawing">
        <svg className="fork-circuit" viewBox="0 0 1000 316" preserveAspectRatio="none" aria-hidden="true">
          <path className="fork-guide" d={forkPaths.without} />
          <path className="fork-guide" d={forkPaths.with} />
          <path className="fork-trace fork-trace-without" data-fork-trace="without" d={unguarded.path} />
          <path className="fork-trace" data-fork-trace="with" d={guarded.path} />
          <path className="fork-boundary" d="M575 190H925" />
          <path className="fork-tip fork-tip-without" data-fork-tip="without" d={unguarded.tip} visibility={pose.without > 0 ? 'visible' : 'hidden'} />
          <path className="fork-tip" data-fork-stop d={guarded.tip} visibility={pose.with > 0 ? 'visible' : 'hidden'} />
          <path className="fork-impact" data-fork-impact d="M730 180Q750 160 770 180 M720 170Q750 140 780 170" opacity="0" />
        </svg>
        <div className="fork-branch-headings">
          <div><h4>Without TENET</h4><span>No TENET check</span></div>
          <div><h4>With TENET</h4><span>Enforce mode <span>· opt-in</span></span></div>
        </div>
        <div className="fork-policy">
          <span className="fork-verdict">{pose.arrived ? 'Would block' : 'Your rule'}</span>
          <p className="fork-rule">{policyRule}</p>
        </div>
      </div>
      <div className="fork-outcomes">
        <div className="fork-outcome">
          <span className="fork-outcome-without">{pose.data === 'intact' ? 'Data intact' : pose.data === 'empty' ? 'Would empty data' : 'Would remove file'}</span>
          <pre><code className="fork-data-without">{dataText(pose.data)}</code></pre>
        </div>
        <div className="fork-outcome">
          <span className="fork-outcome-with">{pose.arrived ? 'Data stays intact' : 'Data intact'}</span>
          <pre><code className="fork-data-with">{sampleData}</code></pre>
        </div>
      </div>
    </div>
    <p className="press-announcement" role="status" aria-atomic="true">{motion.announcement}</p>
  </figure>;
}
