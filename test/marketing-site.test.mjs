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

test("the homepage shows the observe result without implying a block", () => {
  const html = page("index.html");
  expect(html).toContain("Your policy.");
  expect(html).toContain("Their next action.");
  expect(html).toContain("Write the rules. See when an agent's tool call might break one.");
  expect(html).toContain("Observe: TENET flags the call. It still runs.");
  expect(html).toContain("TENET can be wrong. It isn't an OS sandbox.");
  expect(html).toContain("Enforcement is opt-in.");
  expect(html).toContain("Observe is the default.");
  expect(html).toContain("If you opt in to enforcement,");
  expect(html).toContain("TENET_RECORDING=off");
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
