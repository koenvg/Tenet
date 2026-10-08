import { Button } from '../../web/components/ui/button.js';

export default function DocsPage() {
  return <><a className="skip-link" href="#content">Skip to content</a>
    <header className="docs-header">
      <a className="wordmark" href="./index.html" aria-label="TENET home">TENET</a>
      <nav aria-label="Main navigation">
        <a href="./index.html">Home</a>
        <a href="./index.html#how-it-works">How it works</a>
      </nav>
    </header>

    <main className="docs-page" id="content">
      <h1>Use TENET in Pi.</h1>
      <p className="docs-lead">TENET evaluates eligible tool calls against an owner-written policy. Start in observe mode, then decide whether to enable blocking.</p>

      <section id="setup" aria-labelledby="setup-title">
        <h2 id="setup-title">Install the archive</h2>
        <p>Use the <a href="https://github.com/koenvg/Tenet/blob/main/docs/INSTALL-ARCHIVE.md">production archive guide</a> for the recommended Pi owner path. It needs Node 22.19+ with npm, Bun 1.3.14+ and a separate Pi 1.1.0 installation.</p>
        <p>The private passing-main artifact expires after 14 days. No compiler or frontend build is needed.</p>
        <p>Real assessments send policy, paths, tool evidence and bounded recent observations to TypeSafe and use quota. Redaction cannot find every secret in source, commands or rules. Configure <code>TYPESAFE_API_KEY</code> through your secret manager, not in policy or chat.</p>
        <p>After installation, run this supported offline check in the shell the next Pi process will inherit. Replace both paths:</p>
        <pre><code className="language-sh">{"TENET_DIR=/absolute/path/to/tenet\ncd /absolute/path/to/project\nnode \"$TENET_DIR/dist/cli/index.js\" doctor --project \"$PWD\""}</code></pre>
        <p>No global <code>tenet</code> command is installed. Doctor's <code>ready</code> means local prerequisites are valid, not verified hooks or provider connectivity. Credential validity remains unverified.</p>
        <p>Use <a href="https://github.com/koenvg/Tenet/blob/main/docs/doctor.md#fix-invalid-or-unavailable-setup">doctor's fixes</a> for invalid or unavailable setup. Off and dormant are bypass states, not passing assessments.</p>
        <p><a href="https://github.com/koenvg/Tenet/blob/main/CONTRIBUTING.md">Checkout setup and offline checks</a> are developer-only, not the owner installation path.</p>
      </section>

      <section aria-labelledby="policy-title">
        <h2 id="policy-title">Write a rule</h2>
        <p>Global rules activate projects without local rules. They can reach TypeSafe and recordings. An invalid global file makes the complete set unavailable even with valid project rules. Review these effects before creating or changing it.</p>
        <p>Review your intended rules, then author optional <code>~/.tenet/TENET.md</code>, your project's <code>TENET.md</code>, or both yourself, outside the guarded agent's intercepted path. Tenet never creates a global file automatically. No policy ships in the archive. This illustrative local rule is not a complete security policy:</p>
        <pre><code className="language-tenet-policy">{"Rule; Ask before overwriting owner-demo.txt."}</code></pre>
        <p><code>Rule; text</code> is the supported short form. It defaults to <code>BLOCK</code>; explicit <code>BLOCK</code> is optional. Each rule uses one physical line and case-sensitive <code>Rule;</code> syntax.</p>
        <p>Optional <code>~/.tenet/TENET.md</code> from the process owner's home applies alongside the session directory's <code>TENET.md</code>. <code>TENET_POLICY</code> selects an absolute or session-relative project file and replaces only the project candidate.</p>
        <p>There is no global-path override or opt-out, parent search or bundled fallback.</p>
        <p>Only confirmed absence of both implicit candidates without an override makes both modes dormant. Missing explicit files, empty overrides and unusable sources make the whole set unavailable. Observe permits without a pass; enforce blocks. See <a href="https://github.com/koenvg/Tenet/blob/main/docs/policy.md#choose-the-policy-file">global and project selection</a>.</p>
        <p>The sources share 16 declarations and 64 KiB of file bytes, with 4096 UTF-8 bytes per rule. Global declarations are assessed first. Project permissions, severity or thresholds cannot weaken them.</p>
        <p>Follow <a href="https://github.com/koenvg/Tenet/blob/main/docs/policy.md#write-a-first-rule">first-policy steps</a>. For advisory <code>WARN</code> or per-rule metadata, see <a href="https://github.com/koenvg/Tenet/blob/main/docs/policy.md#rule-grammar-and-limits">exact grammar and limits</a>.</p>
        <p>Policy changes invalidate active snapshots. Pi policy-only changes need session-start reload or restart and checked source digests and total count. Code or environment changes need a full restart. SDK hosts close and reopen sessions; the Claude prototype uses bridge reselection.</p>
        <p>In pinned Pi 1.1.0, a switch from eligible to dormant can leave old Tenet command names listed until full native extension reload. Their handlers stay silent while dormant or transitioning, and old status and footer state are cleared. A listed name does not prove active enforcement. See <a href="https://github.com/koenvg/Tenet/blob/main/docs/policy.md#choose-the-policy-file">the pinned host limit</a>.</p>
        <p>Older releases can ignore global discovery and cannot reproduce additive enforcement. See <a href="https://github.com/koenvg/Tenet/blob/main/docs/INSTALL-ARCHIVE.md#removal-and-rollback">owner-reviewed rollback steps</a> before reverting.</p>
        <p>The judge can be wrong or unavailable. Review findings before relying on enforcement.</p>
      </section>

      <section aria-labelledby="modes-title">
        <h2 id="modes-title">Observe or enforce</h2>
        <p>Local capture is on by default in <code>~/.tenet/recordings</code>, including passes. Submitted evidence can contain source code or secrets despite redaction.</p>
        <p>Set <code>TENET_RECORDING=off</code> before starting Pi to stop new capture. It does not prevent provider disclosure or disable native findings. Old records remain until you remove them separately.</p>
        <p>Observe is the default. It reports findings to the owner but never vetoes a call or opens approval, even when assessment is unavailable. Follow the <a href="https://github.com/koenvg/Tenet/blob/main/docs/INSTALL-ARCHIVE.md#restart-observe-and-inspect-findings">fresh-process observation steps</a>, then use <code>/tenet status</code> and <code>/tenet</code>. A real assessed action contacts TypeSafe and needs separate authorization for a live check.</p>
        <pre><code className="language-text">{"Observe: capture -> release -> assess later\nEnforce: capture -> assess -> allow, ask or block\nASK: native consent for this call -> release or block"}</code></pre>
        <p>The flow shows Tenet permission, not proof that a tool ran. <a href="https://github.com/koenvg/Tenet/blob/main/docs/inspector.md">Open the inspector and read findings</a> to compare assessment, permission and observed execution. Pending, lost or missing evidence is not a pass.</p>
        <p><a href="https://github.com/koenvg/Tenet/blob/main/docs/INSTALL-ARCHIVE.md#opt-into-enforcement-later">Enforcement needs a new Pi process</a> with <code>TENET_MODE=enforce</code>. BLOCK rules can stop a call or require native approval for one unchanged pending invocation. WARN stays advisory. An unavailable assessment is not an all-clear.</p>
        <p><code>/tenet off</code> stops new assessment and capture; <code>/tenet on</code> restores this process's mode, not a stale policy. Off does not erase recordings or recall released work. Same-user processes can change this cooperative control; it is not an OS security boundary.</p>
      </section>

      <section id="limits" aria-labelledby="limits-title">
        <h2 id="limits-title">Records and limits</h2>
        <p>The inspector is read-only and unauthenticated on loopback. Do not expose or proxy it to another machine. Use <a href="https://github.com/koenvg/Tenet/blob/main/docs/inspector.md#sensitive-local-storage">storage and deletion instructions</a> and <a href="https://github.com/koenvg/Tenet/blob/main/docs/configuration.md">exact configuration settings</a>.</p>
        <p>Tenet is in alpha, not an OS sandbox. It does not inspect subprocess internals or cover actions outside host hooks. Judgments and reporting can fail; Tenet cannot guarantee complete coverage or safety.</p>
        <p>Stock Pi and Claude have unsupported authenticated action resolution, so ordinary reads and edits do not automatically qualify for applicability exemptions. The <a href="https://github.com/koenvg/Tenet/blob/main/docs/claude-code.md">Claude Code prototype</a> is opt-in and unverified; Pi installation or enforce mode does not establish Claude coverage.</p>
        <p>For applications, use the <a href="https://github.com/koenvg/Tenet/blob/main/docs/sdk.md">alpha SDK without Pi</a> and check <a href="https://github.com/koenvg/Tenet/blob/main/docs/shared-runtime.md">host integration duties</a>. Read <a href="https://github.com/koenvg/Tenet/blob/main/docs/limits.md">disclosure, approval and coverage limits</a> before relying on the guard.</p>
      </section>

      <Button asChild variant="outline" className="docs-back"><a href="./index.html">Back to TENET</a></Button>
    </main>
    <footer className="site-footer docs-footer"><span>TENET</span><a href="./index.html">Home</a></footer></>;
}
