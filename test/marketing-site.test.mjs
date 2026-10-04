import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const siteRoot = new URL("../site/", import.meta.url);
const pages = ["index.html", "docs.html"];

function page(name) {
  return readFileSync(new URL(name, siteRoot), "utf8");
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
  expect(html).toContain("You write the rules. TENET checks the agent's tool calls against them.");
  expect(html).toContain("Your rule, for example");
  expect(html).toContain("Never delete production data.");
  expect(html).toContain("<strong>Delete blocked</strong> before execution.");
  expect(html).toContain(">Blocked</text>");
  expect(html).toContain("Illustrative opt-in enforcement. Observe mode only reports.");
  expect(html).toContain("TENET can be wrong. It isn't an OS sandbox.");
  expect(html).toContain("Observe is the default.");
  expect(html).toContain("If you opt in to enforcement,");
  expect(html).toContain("Coverage &amp; recording");
  expect(html).toContain("even when a call passes");
  expect(html).toContain("code or secrets");
  expect(html).toContain("TENET_RECORDING=off");
});

test("the homepage uses only neutral black, white and grey colors", () => {
  for (const name of ["index.html", "style.css"]) {
    const colors = [...page(name).matchAll(/#([\da-f]{6}|[\da-f]{3})\b/gi)];
    expect(colors.length).toBeGreaterThan(0);
    for (const [, hex] of colors) {
      const rgb = hex.length === 3 ? [...hex].map((channel) => channel.repeat(2)) : hex.match(/../g);
      expect(new Set(rgb.map((channel) => channel.toLowerCase())).size).toBe(1);
    }
  }
});

test("the animation script is shipped with the static site", () => {
  const html = page("index.html");
  expect(html).toContain('<script src="./hero.js" defer></script>');
  expect(page("hero.js").length).toBeGreaterThan(0);
  expect(page("Dockerfile")).toContain("style.css hero.js /srv/site/");
  expect(page(".dockerignore")).toContain("!hero.js");
});

test("docs link every reader journey and retain policy, privacy, mode and coverage limits", () => {
  const html = page("docs.html");
  const prefix = "https://github.com/koenvg/Tenet/blob/main/";
  const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)].map(match => match[2]);
  for (const destination of [
    "docs/INSTALL-ARCHIVE.md", "docs/policy.md#write-a-first-rule", "docs/policy.md#rule-grammar-and-limits", "docs/policy.md#migrate-from-tenet_policy",
    "docs/inspector.md", "docs/inspector.md#sensitive-local-storage",
    "docs/doctor.md#fix-invalid-or-unavailable-setup", "docs/sdk.md", "docs/shared-runtime.md",
    "docs/configuration.md", "docs/limits.md", "docs/claude-code.md", "CONTRIBUTING.md",
    "docs/INSTALL-ARCHIVE.md#restart-observe-and-inspect-findings",
    "docs/INSTALL-ARCHIVE.md#opt-into-enforcement-later",
  ]) expect(links).toContain(prefix + destination);
  for (const text of [
    "Rule; Ask before overwriting owner-demo.txt.", "supported short form", "defaults to <code>BLOCK</code>",
    "explicit <code>BLOCK</code> is optional", "one physical line", "case-sensitive", "Only the session directory's", "both modes are dormant, including enforce",
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
    "Bun 1.3.14+", "separate Pi 0.85.1 installation", "No compiler or frontend build is needed",
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
