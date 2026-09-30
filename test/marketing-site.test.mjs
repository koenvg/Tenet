import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const siteRoot = new URL("../site/", import.meta.url);
const pages = ["index.html", "docs.html"];

function page(name) {
  return readFileSync(new URL(name, siteRoot), "utf8");
}

test("every local navigation link resolves to a shipped page or section", () => {
  for (const name of pages) {
    const html = page(name);
    const links = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)];
    expect(links.length).toBeGreaterThan(0);

    for (const [, href] of links) {
      const target = new URL(href, new URL(name, siteRoot));
      if (target.protocol === "https:") {
        expect(target.href).toBe("https://github.com/koenvg/Tenet");
        continue;
      }
      expect(target.protocol).toBe("file:");
      expect(existsSync(fileURLToPath(target))).toBe(true);
      if (target.hash) {
        const targetHtml = readFileSync(target, "utf8");
        expect(targetHtml).toContain(`id="${decodeURIComponent(target.hash.slice(1))}"`);
      }
    }
  }
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

test("docs explain the policy syntax, setup, and limits", () => {
  const html = page("docs.html");
  expect(html).toContain('href="https://github.com/koenvg/Tenet"');
  expect(html).toContain("git clone https://github.com/koenvg/Tenet.git");
  expect(html).toContain("Rule; BLOCK;");
  expect(html).toContain("TYPESAFE_API_KEY");
  expect(html).toContain("TENET_MODE=enforce");
  expect(html).toContain("TENET_RECORDING=off");
  expect(html).toContain("It cannot guarantee complete coverage or safety.");
  expect(existsSync(fileURLToPath(new URL("fonts/Geist-latin.woff2", siteRoot)))).toBe(true);
});

test("setup uses an existing parent directory and installs that checkout", () => {
  const html = page("docs.html");
  const commands = html.match(/<pre><code>(git clone[\s\S]*?)<\/code><\/pre>/)?.[1];
  expect(commands).toBe(`git clone https://github.com/koenvg/Tenet.git "$HOME/Tenet"
cd "$HOME/Tenet"
bun install --frozen-lockfile
pi install "$PWD"`);
});
