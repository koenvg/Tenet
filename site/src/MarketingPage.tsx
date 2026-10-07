import { useRef } from 'react';
import { Button } from '../../web/components/ui/button.js';
import KeyArt from './KeyArt.js';
import { useKeyMotion } from './use-key-motion.js';

export default function MarketingPage() {
  const hero = useRef<HTMLElement>(null);
  const motion = useKeyMotion(hero);
  return <main className="marketing-page">
      <section className="first-screen" id="top" aria-labelledby="headline" data-keypress data-motion={motion.motion} ref={hero}>
        <header className="site-header">
          <a className="wordmark" href="#top" aria-label="TENET home">TENET</a>
          <nav aria-label="Main navigation"><a href="#how-it-works">How it works <span aria-hidden="true">↗</span></a></nav>
        </header>

        <div className="hero-copy">
          <p className="hero-eyebrow">You write the rules</p>
          <h1 id="headline"><span>Some actions</span><span><em>never land.</em></span></h1>
          <p className="hero-lead">You write the rules. TENET checks the agent's tool calls against them.</p>
        </div>

        <figure className="keypress" aria-labelledby="example-rule">
          {motion.ready ? <Button variant="ghost" className="key-button" aria-label="Try pressing delete" aria-describedby="example-rule keypress-description" title="Try pressing the key" onClick={motion.press}><KeyArt /></Button> : <KeyArt />}
          <figcaption className="written-rule">
            <p className="rule-author">Your rule, for example</p>
            <p id="example-rule">Never delete production data.</p>
          </figcaption>
        </figure>
        <p className="press-announcement" data-press-announcement role="status" aria-atomic="true">{motion.announcement}</p>
        <div className="hero-feedback">
          <p data-hero-status aria-hidden="true"><strong>Delete blocked</strong> before execution. Finding reported.</p>
          <Button variant="ghost" className="motion-control" type="button" data-motion-control hidden={!motion.ready} onClick={motion.toggle}>{motion.controlLabel}</Button>
        </div>
        <div className="hero-actions"><Button asChild className="primary-action"><a href="./docs.html">Read the docs <span aria-hidden="true">↗</span></a></Button></div>
        <p className="hero-limit">Illustrative opt-in enforcement. Observe mode only reports.</p>
      </section>

      <section className="explanation" id="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title">Your policy.<br />In plain text.</h2>
        <div>
          <p>Write your rules in <code>TENET.md</code> or select another policy file. TENET checks eligible Pi tool calls before they run.</p>
          <p>Observe is the default. It reports findings without stopping calls. If you opt in to enforcement, TENET can block calls or request native approval, depending on the assessment.</p>
        </div>
      </section>
      <details className="coverage">
        <summary>Coverage &amp; recording</summary>
        <p>TENET only checks tool calls it can see through Pi, not subprocesses. In eligible sessions, it saves submitted evidence locally by default, even when a call passes. That evidence may include code or secrets. Set <code>TENET_RECORDING=off</code> before starting Pi to opt out of new recordings.</p>
        <a className="read-more" href="./docs.html#limits">Read the full limits <span aria-hidden="true">→</span></a>
      </details>
      <footer className="site-footer">
        <p>TENET can be wrong. It isn't an OS sandbox.</p>
        <a href="./docs.html">Documentation <span aria-hidden="true">↗</span></a>
      </footer>
    </main>;
}
