# Design

## Context

See `proposal.md` for motivation. `site/` contains `index.html`, `docs.html`, `style.css`, local fonts, and an internal `DESIGN.md`. Links already use relative `.html` paths. The root package is a Bun application with a separately built inspector; it has no website build or serve command. Existing GitHub CI validates the application and produces an installable archive, not a hosted site.

Railway and a generated domain are confirmed choices. A design is included because this adds an external hosting dependency and a public file boundary.

## Goals / Non-Goals

Goals:
- Keep website deployment independent of the application dependency tree and inspector build.
- Make the production container reproducible and locally testable.
- Keep configuration and private runtime data outside the web root by construction.

Non-goals:
- Custom DNS, databases, authentication, analytics, content redesign, or public inspector access.
- Modifying policy enforcement or the application's installation archive.

## Decisions

### Use a dedicated static Caddy container

Add `site/Dockerfile`, `site/Caddyfile`, and a narrow `site/.dockerignore`. Pin a supported Caddy image version, resolving the exact version and digest during implementation. Copy only the two public HTML files, CSS, and approved font assets into the web root. Keep the Caddyfile outside it. Do not copy all of `site/`, since that would publish its design notes and future deployment files.

A custom Bun server would add application code for standard static-file behavior. Building the root package would unnecessarily install the agent SDK and inspector dependencies. Caddy avoids both.

### Let Railway terminate TLS

Caddy serves HTTP on all interfaces at Railway's `PORT`, with a documented local default. Disable automatic HTTPS inside the container and do not expose Caddy's administrative endpoint publicly. Use normal static-file serving without directory browsing or SPA fallback. Railway supplies the generated domain and external TLS. Set the health check to `/`.

### Isolate the service to the website directory

Use `site/` as the Railway service root and place config-as-code at `site/railway.toml`. Explicitly select that configuration path in Railway, verifying current path semantics during implementation rather than assuming root-relative discovery. Use the Dockerfile builder and watch paths covering `site/**`. Connect `koenvg/Tenet`, branch `main`, with automatic deployment enabled. Confirm the effective settings in Railway because GitHub connection, branch selection, and domain creation are control-plane settings, not solely repository files.

Keeping everything under `site/` avoids changing the root application's build behavior. Repository-root deployment is an alternative but requires broader build context and more exclusions.

### Verify the same container locally and remotely

Add a focused smoke check runnable against a base URL. Check `/`, `/index.html`, `/docs.html`, CSS and referenced fonts, expected content types, missing-page 404s, and rejection of repository/configuration paths. Run it against the built container with a non-default port and against the generated HTTPS URL. Add a separate website-container CI job without coupling it to the inspector build. Manually inspect navigation and font loading in a browser after deployment.

Document setup, effective root/config paths, watch paths, public URL, verification commands, and restoration of a previous revision in `docs/DEPLOYMENT.md`. Deployment evidence records the revision and test results, without credentials.

## Risks / Trade-offs

- Railway workspace access, GitHub permissions, and billing availability are unverified. Confirm them before provisioning; stop and report a concrete blocker if unavailable.
- Railway runs a container for a static site, which can cost more than static-only hosting. Keep a single service without persistent volumes or application secrets.
- Service-root and configuration-path behavior can cause a wrong build. Verify against current Railway documentation and inspect the resulting build logs and effective configuration.
- A broad copy could expose design notes or configuration. Use an explicit asset allowlist and negative HTTP tests.
- Native GitHub autodeploy does not itself prove CI passed. Configure Railway's CI-wait option if supported for this connection, and document the actual behavior rather than claiming an unverified release gate.
- A homepage health check does not prove every asset works. Run the full smoke check before reporting launch complete.

## Migration Plan

1. Implement and test the static container, Railway configuration, smoke checks, CI job, and runbook.
2. Publish the reviewed configuration to `main` through the repository's normal review flow before enabling production autodeploy.
3. Confirm the target Railway workspace and available plan, connect the repository, and configure the isolated service.
4. Generate the Railway domain, verify the target port and readiness, and run live checks plus a browser inspection.
5. Record the URL, revision, and results on TENET-12. On failure, retain the previous healthy deployment where available, or stop the initial service until fixed.
6. For rollback after a successful launch, redeploy the last verified revision using Railway's deployment history. If unavailable, revert the website change on `main` and deploy that revision. Verify the same public URL again.

## Open Questions

- Which Railway workspace/project should own the service? Resolve during apply before any provisioning; this does not affect the static-site architecture.
- What generated hostname will Railway allocate? Record it after domain creation.
