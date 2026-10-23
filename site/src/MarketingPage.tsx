import { useRef } from 'react';
import { Button } from '../../web/components/ui/button.js';
import KeyArt from './KeyArt.js';
import { useKeyMotion } from './use-key-motion.js';
import PolicyFork from './PolicyFork.js';

export default function MarketingPage() {
  const hero = useRef<HTMLElement>(null);
  const motion = useKeyMotion(hero);
  return <>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="site-header marketing-header" id="top">
      <a className="wordmark" href="#top" aria-label="TENET home"><img className="brand-mark" src="/tenet-gate.svg" width="28" height="28" alt="" aria-hidden="true" /></a>
      <nav aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#faq">FAQ</a>
        <a href="./docs.html">Docs</a>
      </nav>
    </header>
    <main className="marketing-page" id="content" tabIndex={-1}>
      <section className="first-screen" aria-labelledby="headline" data-keypress data-motion={motion.motion} ref={hero}>
        <div className="hero-copy">
          <h1 id="headline"><span>Some actions</span><span><em>never land.</em></span></h1>
        </div>

        <figure className="keypress" aria-labelledby="example-rule">
          {motion.ready ? <Button variant="ghost" className="key-button" aria-label="Try pressing delete" aria-describedby="example-rule keypress-description" title="Try pressing the key" onClick={motion.press}><KeyArt /></Button> : <KeyArt />}
          <p className="keypress-hint" aria-hidden={!motion.ready}>Try pressing Delete</p>
          <figcaption className="written-rule">
            <p className="rule-author">Your rule, for example</p>
            <p id="example-rule">Never delete production data.</p>
          </figcaption>
        </figure>
        <p className="press-announcement" data-press-announcement role="status" aria-atomic="true">{motion.announcement}</p>
        <div className="hero-actions"><Button asChild className="primary-action"><a href="./docs.html#setup">Read the setup guide <span aria-hidden="true">↗</span></a></Button></div>
      </section>

      <section className="marketing-section policy-story" id="how-it-works" aria-labelledby="how-title">
        <PolicyFork ready={motion.ready} />
      </section>


      <section className="marketing-section faq-story" id="faq" aria-labelledby="faq-title">
        <h2 id="faq-title">Before you start</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary>Does TENET block calls by default?</summary>
            <p>No. Observe is the default. It never blocks a call or asks for approval, even when assessment is unavailable. Enforcement requires explicit opt-in and a process restart.</p>
          </details>
          <details className="faq-item">
            <summary>Does it cover everything an agent does?</summary>
            <p>No. TENET checks eligible calls through host hooks. It does not inspect subprocess internals or actions outside those hooks. Judgments can be wrong, and TENET is not an OS sandbox.</p>
          </details>
          <details className="faq-item">
            <summary>Does evidence stay on my machine?</summary>
            <p>No. Real assessments send policy, paths, tool evidence and bounded recent observations to TypeSafe and use quota. Local recording is on by default. Both submitted evidence and local records can contain secrets despite redaction.</p>
          </details>
          <details className="faq-item">
            <summary>What does turning recording off change?</summary>
            <p>Set <code>TENET_RECORDING=off</code> before starting the integration to stop new local capture. It does not stop provider disclosure or native findings, and it does not delete old records.</p>
          </details>
          <details className="faq-item">
            <summary>How do I install the alpha?</summary>
            <p>Start with the setup guide. Install locked dependencies with Bun and build Tenet from a stable checkout at a verified commit. You need repository access. The guide lists prerequisites and an offline setup check.</p>
            <a className="read-more" href="./docs.html#setup">Check installation and access <span aria-hidden="true">→</span></a>
          </details>
        </div>
      </section>

      <section className="marketing-section closing-story" id="get-started" aria-labelledby="start-title">
        <code className="closing-mark" aria-hidden="true">Rule;</code>
        <div>
          <h2 id="start-title">Start with your own rule.</h2>
          <p>Read the prerequisites. Install the alpha. Begin in observe mode and review the findings before choosing enforcement.</p>
          <a className="read-more" href="./docs.html#setup">Start with the setup guide <span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <footer className="site-footer">
        <p>TENET can be wrong. It isn't an OS sandbox.</p>
        <nav aria-label="Footer navigation">
          <a href="./docs.html">Documentation</a>
          <a href="./docs.html#limits">Limits</a>
          <a href="#faq">FAQ</a>
          <a href="https://github.com/koenvg/Tenet">Repository</a>
        </nav>
      </footer>
    </main>
  </>;
}
