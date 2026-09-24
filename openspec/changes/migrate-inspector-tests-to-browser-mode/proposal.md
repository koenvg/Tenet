# Proposal

## Why

Inspector UI verification depends on a hand-driven JSDOM script and a Vitest suite that attaches to the owner's Arc through CDP. The Arc dependency blocks unattended CI, while JSDOM cannot check real browser layout or focus behavior. Move UI verification to an isolated headless browser without weakening existing archive, security, and interaction coverage.

## What Changes

- Replace `inspector/tests/ui.mjs` with isolated Svelte component tests in Vitest Browser Mode. Use recorded synthetic data and controlled API responses to cover presentation, interactions, error states, and navigation.
- Run the existing built-client and local-server browser checks in a disposable headless Chromium instance rather than attaching to Arc. Port JSDOM-only integration cases before removing the script.
- Give local developers and future CI repeatable browser installation and test commands that require neither Arc nor evaluator credentials. Keep failure screenshots as test artifacts.
- Keep Bun server and archive contract tests. Do not change inspector decisions, the Pi command's Arc launch, or production dependencies. Adjust responsive header spacing only to satisfy the existing 768px no-overflow test, as approved during implementation.

## Capabilities

### New Capabilities

None. This changes test tooling, not a product capability.

### Modified Capabilities

None. The inspector and Pi launch requirements remain unchanged. This change sets `skip_specs: true` because it has no spec-level behavior delta.

## Impact

- `inspector/tests/`, `inspector/vitest.config.ts` or separate Vitest configs, `package.json`, `bun.lock`, `inspector/tests/README.md`, and the README verification instructions.
- Development dependencies for Vitest Browser Mode, Svelte rendering and browser installation. No evaluator calls, owner browser profile, or production API changes.
