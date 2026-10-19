import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { policyRoutes, policyRule } from '../site/src/policy-routes.ts';

test('the deletion proposals are data only and match the displayed rule', () => {
  expect(policyRule).toBe('Never delete production data.');
  expect(policyRoutes.map(({ id, call }) => ({ id, call }))).toEqual([
    { id: 'pi-write', call: { name: 'write', arguments: { path: 'production/customers.json', content: '[]\n' } } },
    { id: 'bash-rm', call: { name: 'bash', arguments: { command: 'rm production/customers.json' } } },
    { id: 'bash-python', call: { name: 'bash', arguments: { command: `python3 -c 'from pathlib import Path; Path("production/customers.json").unlink()'` } } },
    { id: 'bash-find', call: { name: 'bash', arguments: { command: 'find production -name customers.json -delete' } } },
  ]);
});
const siteRoot = new URL("../site/dist/", import.meta.url);
const pages = ["index.html", "docs.html"];

function page(name) {
  return readFileSync(new URL(name, siteRoot), "utf8").replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("<!-- -->", "");
}

const repositoryRoot = new URL("../", import.meta.url);
const repositoryDocuments = new Set([
  "README.md", "CONTRIBUTING.md", "docs/INSTALL-ARCHIVE.md", "docs/doctor.md",
  "docs/policy.md", "docs/inspector.md", "docs/configuration.md", "docs/limits.md",
  "docs/sdk.md", "docs/shared-runtime.md", "docs/claude-code.md",
]);

function markdownAnchors(markdown) {
  const anchors = new Set();
  const counts = new Map();
  let fence;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    for (const [, alias] of line.matchAll(/<a\b[^>]*\b(?:id|name)="([^"]+)"/g)) anchors.add(alias);
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*$/);
    if (!heading) continue;
    const slug = heading[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/<[^>]+>/g, "")
      .replace(/[`*~]/g, "").toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, "").replace(/ /g, "-");
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    anchors.add(count ? `${slug}-${count}` : slug);
  }
  return anchors;
}

function validateRepositoryLink(href) {
  const target = new URL(href);
  assert.equal(target.origin, "https://github.com");
  assert.equal(target.username, "");
  assert.equal(target.password, "");
  assert.equal(target.search, "");
  assert.equal(target.href, href, "Repository links must use canonical URLs");
  if (target.pathname === "/koenvg/Tenet") {
    assert.equal(target.hash, "");
    return;
  }
  const match = target.pathname.match(/^\/koenvg\/Tenet\/blob\/main\/(.+)$/);
  assert.ok(match, "Only the Tenet repository or blob/main documentation is allowed");
  const document = match[1];
  assert.ok(repositoryDocuments.has(document), `Not a maintained website documentation target: ${document}`);
  const local = new URL(document, repositoryRoot);
  assert.ok(existsSync(fileURLToPath(local)), `Missing linked document: ${document}`);
  const markdown = readFileSync(local, "utf8");
  if (target.hash) {
    const anchor = decodeURIComponent(target.hash.slice(1));
    assert.ok(markdownAnchors(markdown).has(anchor), `Missing heading in ${document}: ${anchor}`);
  }
}

test("every navigation link resolves to a shipped page, section or maintained Tenet document", () => {
  const shippedPages = pages.map(name => new URL(name, siteRoot).pathname);
  for (const name of pages) {
    const html = page(name);
    const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)];
    expect(links.length).toBeGreaterThan(0);

    for (const [, , href] of links) {
      const target = new URL(href, new URL(name, siteRoot));
      if (target.protocol === "https:") {
        validateRepositoryLink(href);
        continue;
      }
      expect(target.protocol).toBe("file:");
      expect(target.host).toBe("");
      expect(target.search).toBe("");
      expect(shippedPages).toContain(target.pathname);
      expect(existsSync(fileURLToPath(target))).toBe(true);
      if (target.hash) {
        const targetHtml = readFileSync(target, "utf8");
        expect(targetHtml).toContain(`id="${decodeURIComponent(target.hash.slice(1))}"`);
      }
    }
  }
});

test("repository links reject other origins, repositories, refs, files and missing headings", () => {
  const prefix = "https://github.com/koenvg/Tenet";
  for (const href of [
    "http://github.com/koenvg/Tenet", "https://example.com/koenvg/Tenet",
    "https://github.com.evil.test/koenvg/Tenet", "https://user@github.com/koenvg/Tenet",
    "https://github.com/other/Tenet", "https://github.com/koenvg/Tenet-other",
    `${prefix}?redirect=elsewhere`, `${prefix}#missing`,
    `${prefix}/blob/other/docs/policy.md`, `${prefix}/tree/main/docs`,
    `${prefix}/blob/main/src/pi/extension.ts`, `${prefix}/blob/main/TENET.md`,
    `${prefix}/blob/main/docs/missing.md`, `${prefix}/blob/main/docs/policy.md#missing-heading`,
    `${prefix}/blob/main/docs/../README.md`, `${prefix}/blob/main/docs/%70olicy.md`,
  ]) expect(() => validateRepositoryLink(href)).toThrow();
  expect(() => validateRepositoryLink(prefix)).not.toThrow();
  expect(() => validateRepositoryLink(`${prefix}/blob/main/docs/policy.md#write-a-first-rule`)).not.toThrow();
  expect(() => validateRepositoryLink(`${prefix}/blob/main/README.md#quickstart-for-pi-owners`)).not.toThrow();
});

test("Markdown heading checks ignore fenced examples and retain aliases and duplicate slugs", () => {
  const markdown = [
    "# Use `Rule;` and thresholds", "## Same heading", "## Same heading",
    '<a id="legacy-anchor"></a>', "```text", "# Not a heading", "```",
    "   ```tenet-policy", "## Also not a heading", "   ```",
  ].join("\r\n");
  expect([...markdownAnchors(markdown)]).toEqual([
    "use-rule-and-thresholds", "same-heading", "same-heading-1", "legacy-anchor",
  ]);
});

test("the keypress hero applies an owner-written rule before deletion", () => {
  const html = page("index.html");
  expect(html).toContain("Some actions");
  expect(html).toContain("never land.");
  expect(html).toContain("You write the rules. TENET checks eligible Pi tool calls against them.");
  expect(html).toContain("Your rule, for example");
  expect(html).toContain("Never delete production data.");
  expect(html).toContain(">Blocked</text>");
  expect(html).not.toMatch(/hero-feedback|hero-limit|alpha-note|data-motion-control|data-hero-status/);
  expect(html).toContain("TENET can be wrong. It isn't an OS sandbox.");
  expect(html).toContain("Observe is the default.");
});

test("the focused homepage retains setup, FAQ and factual safety limits", () => {
  const html = page("index.html").replace(/<br\s*\/?>/g, " ");
  for (const id of ["content", "how-it-works", "faq", "get-started"]) expect(html).toContain(`id="${id}"`);
  for (const id of ["modes", "inspector", "workflows", "privacy"]) {
    expect(html).not.toContain(`id="${id}"`);
    expect(html).not.toContain(`href="#${id}"`);
  }
  for (const text of [
    "1. Write your rule in <code>TENET.md</code> in plain text.", "Before you start", "Start with your own rule.",
    "eligible Pi tool calls",
    "Observe is the default.", "never blocks a call or asks for approval", "even when assessment is unavailable",
    "Enforcement requires explicit opt-in and a new Pi process", "does not inspect subprocess internals",
    "policy, paths, tool evidence and bounded recent observations to TypeSafe", "use quota", "secrets despite redaction",
    "TENET_RECORDING=off", "before starting Pi", "does not stop provider disclosure or native findings",
    "does not delete old records", "private passing-main GitHub Actions artifact", "not an npm package or public release",
  ]) expect(html).toContain(text);
  expect(html).not.toContain('TENET checks eligible Pi tool calls and reports findings to you, not the agent. The animation uses fictional data and runs no tools or assessments.');
  expect(html).toMatch(/href="\.\/docs\.html#setup"[^>]*>Read the setup guide/);
  expect(html.match(/>Read the setup guide/g)).toHaveLength(1);
  expect(html.match(/<details class="faq-item">/g)).toHaveLength(5);
  expect(html).toContain('href="#content">Skip to content');
  expect(html).toContain('href="#faq">FAQ');
  expect(html).toContain('href="./docs.html#limits">Limits');
  expect(existsSync(new URL('../site/src/ModeScene.tsx', import.meta.url))).toBe(false);
  for (const fact of ['Pi 1.3.0', 'alpha SDK without Pi', 'opt-in and unverified', 'one unchanged pending invocation', 'unencrypted', 'owner-restricted', 'not a complete audit log']) expect(page('docs.html')).toContain(fact);
});

test('the local animation is prerendered without removed sections or inert controls', () => {
  const html = page('index.html');
  for (const text of ['fork-demonstration', 'Fictional Pi call', 'Enforce mode', 'opt-in', 'Would block', 'Would empty data']) expect(html).toContain(text);
  expect(html.match(/class="fork-demonstration"/g)).toHaveLength(1);
  expect(html.match(/class="fork-rule">Never delete production data\./g)).toHaveLength(1);
  expect(html).toContain('class="fork-data-without">[]');
  expect(html).toContain('class="fork-data-with">[\n  { "id": "example" }\n]');
  expect(html).not.toMatch(/policy-workbench|policy-rig|data-rig-part|class="policy-file"|class="gate-result"/);
  expect(html).not.toMatch(/policy-caption|policy-transport|policy-qualification|argument-inspector|policy-examples|policy-details|mode-story|inspector-story|workflow-story|privacy-story|evidence-spread/);
  const policy = html.split('id="how-it-works"')[1].split('</section>')[0];
  expect(policy.match(/<h2\b/g)).toHaveLength(1);
  expect(policy).toContain('<h2 id="how-title">1. Write your rule in <code>TENET.md</code> in plain text.</h2>');
  expect(policy).not.toMatch(/<h3\b|Your policy\.|Same call\.|Different ending\.|section-intro/);
  expect(policy).not.toMatch(/<figcaption|<details|<div class="policy-navigation"|<div class="policy-play-controls"/);
  expect(html).not.toMatch(/Verified|reliably understood|all methods/);
  expect(html).not.toMatch(/<button[^>]*aria-pressed=/);
  expect(html).not.toMatch(/<input|<textarea|contenteditable/);
});

test("homepage metadata describes the current Pi alpha without invented deployment facts", () => {
  const html = page("index.html");
  expect(html).toContain('<meta property="og:title" content="TENET | Your rules. Their next move."');
  expect(html).toContain('<meta property="og:type" content="website"');
  expect(html).toContain('<meta name="twitter:card" content="summary"');
  for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    expect(html).toContain(`${attribute} content="TENET is an alpha policy guard for Pi. Write plain-text rules, observe findings, and opt into enforcement. Start with the setup guide."`);
  }
  expect(html).not.toMatch(/rel="canonical"|og:url|og:image|application\/ld\+json/);
});
test("the homepage uses only neutral black, white and grey colors", () => {
  for (const source of [page("index.html"), readFileSync(new URL("../site/style.css", import.meta.url), "utf8")]) {
    const colors = [...source.matchAll(/#([\da-f]{6}|[\da-f]{3})\b/gi)];
    expect(colors.length).toBeGreaterThan(0);
    for (const [, hex] of colors) {
      const rgb = hex.length === 3 ? [...hex].map((channel) => channel.repeat(2)) : hex.match(/../g);
      expect(new Set(rgb.map((channel) => channel.toLowerCase())).size).toBe(1);
    }
  }
});

test("the React client is shipped with the prerendered site", () => {
  const html = page("index.html");
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(page(script.replace(/^\//, "")).length).toBeGreaterThan(0);
  expect(readFileSync(new URL("../site/Dockerfile", import.meta.url), "utf8")).toContain("COPY --from=build /app/site/dist/ /srv/site/");
  expect(readFileSync(new URL("../site/Dockerfile.dockerignore", import.meta.url), "utf8")).toContain("!site/src/**");
});

test("docs link every reader journey and retain policy, privacy, mode and coverage limits", () => {
  const html = page("docs.html");
  const prefix = "https://github.com/koenvg/Tenet/blob/main/";
  const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)].map(match => match[2]);
  for (const destination of [
    "docs/INSTALL-ARCHIVE.md", "docs/policy.md#write-a-first-rule", "docs/policy.md#rule-grammar-and-limits", "docs/policy.md#choose-the-policy-file",
    "docs/inspector.md", "docs/inspector.md#sensitive-local-storage",
    "docs/doctor.md#fix-invalid-or-unavailable-setup", "docs/sdk.md", "docs/shared-runtime.md",
    "docs/configuration.md", "docs/limits.md", "docs/claude-code.md", "CONTRIBUTING.md",
    "docs/INSTALL-ARCHIVE.md#restart-observe-and-inspect-findings",
    "docs/INSTALL-ARCHIVE.md#opt-into-enforcement-later",
  ]) expect(links).toContain(prefix + destination);
  for (const text of [
    "Rule; Ask before overwriting owner-demo.txt.", "supported short form", "defaults to <code>BLOCK</code>",
    "explicit <code>BLOCK</code> is optional", "one physical line", "case-sensitive", "Optional <code>~/.tenet/TENET.md</code>",
    "TENET_POLICY", "absolute or session-relative project file", "replaces only the project candidate",
    "both implicit candidates", "no global-path override or opt-out", "Missing explicit files, empty overrides",
    "unusable sources make the whole set unavailable", "16 declarations", "64 KiB", "4096",
    "activate projects without local rules", "invalid global file", "TypeSafe and recordings",
    "outside the guarded agent's intercepted path", "No policy ships in the archive",
    "TypeSafe", "policy, paths, tool evidence and bounded recent observations", "use quota",
    "TYPESAFE_API_KEY", "through your secret manager", "secrets despite redaction",
    "Local capture is on by default", "~/.tenet/recordings", "TENET_RECORDING=off",
    "before starting Pi", "does not prevent provider disclosure or disable native findings",
    "Old records remain", "read-only and unauthenticated on loopback", "Do not expose or proxy",
    "Observe is the default", "never vetoes a call or opens approval", "even when assessment is unavailable",
    "TENET_MODE=enforce", "new Pi process", "one unchanged pending invocation", "WARN stays advisory",
    "An unavailable assessment is not an all-clear", "separate authorization for a live check",
    "not proof that a tool ran", "Pending, lost or missing evidence is not a pass",
    "not an OS sandbox", "does not inspect subprocess internals", "outside host hooks",
    "cannot guarantee complete coverage or safety", "unsupported authenticated action resolution",
    "do not automatically qualify for applicability exemptions", "opt-in and unverified",
    "Pi installation or enforce mode does not establish Claude coverage",
  ]) expect(html).toContain(text);
  const flow = html.match(/<pre><code class="language-text">([\s\S]*?)<\/code><\/pre>/)?.[1];
  expect(flow).toContain("Observe: capture -&gt; release -&gt; assess later");
  expect(flow).toContain("Enforce: capture -&gt; assess -&gt; allow, ask or block");
  expect(flow).toContain("ASK: native consent for this call -&gt; release or block");
  expect(existsSync(fileURLToPath(new URL("fonts/Geist-latin.woff2", siteRoot)))).toBe(true);
});

test("owner setup uses the archive's offline compiled doctor and separates developer checkout setup", () => {
  const html = page("docs.html");
  const setup = html.match(/<section\b[^>]*\bid="setup"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  expect(setup).toBeDefined();
  for (const text of [
    "recommended Pi owner path", "docs/INSTALL-ARCHIVE.md", "Node 22.19+ with npm",
    "Bun 1.3.14+", "separate Pi 1.3.0 installation", "No compiler or frontend build is needed",
    "supported offline check", "Replace both paths", "No global <code>tenet</code> command is installed",
    "local prerequisites are valid, not verified hooks or provider connectivity",
    "Off and dormant are bypass states, not passing assessments",
  ]) expect(setup).toContain(text);
  const commands = setup.match(/<pre><code class="language-sh">([\s\S]*?)<\/code><\/pre>/)?.[1];
  expect(commands).toBe(`TENET_DIR=/absolute/path/to/tenet
cd /absolute/path/to/project
node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"`);
  const developer = setup.match(/<p><a href="https:\/\/github.com\/koenvg\/Tenet\/blob\/main\/CONTRIBUTING\.md">([\s\S]*?)<\/p>/)?.[1];
  expect(developer).toContain("Checkout setup and offline checks");
  expect(developer).toContain("developer-only, not the owner installation path");
  expect(html).not.toContain("git clone");
  expect(html).not.toContain("src/cli/index.ts");
});

test('global activation warnings precede the website authoring step', () => {
  const policy = page('docs.html').split('<h2 id="policy-title">')[1].split('</section>')[0];
  const authoring = policy.indexOf('then author optional');
  expect(authoring).toBeGreaterThan(0);
  for (const warning of ['activate projects without local rules', 'TypeSafe and recordings', 'invalid global file']) {
    const position = policy.indexOf(warning);
    expect(position).toBeGreaterThanOrEqual(0);
    expect(position).toBeLessThan(authoring);
  }
  expect(policy.indexOf('class="language-tenet-policy"')).toBeGreaterThan(authoring);
});
