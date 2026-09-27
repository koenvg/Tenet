# Tasks

## 1. Static website container

- [x] 1.1 Add a base-URL smoke check for homepage, docs, linked CSS/fonts, content types, missing paths, non-public files, and disabled directory listings; demonstrate it fails against an unavailable or incorrect server before implementing the container.
- [x] 1.2 Add `site/Dockerfile`, `site/Caddyfile`, and `site/.dockerignore` with a pinned Caddy image and explicit public asset copies; verify a local image builds without root application dependencies and passes the smoke check on a non-default `PORT`.
- [x] 1.3 Add an independent website-container CI job; verify its build and smoke commands locally and confirm the workflow runs those checks without the inspector build.
- [x] 1.4 Start `docs/DEPLOYMENT.md` with local build/run/check commands and the public asset boundary; verify the commands work as written and configuration/design files are absent from the served root.

## 2. Railway deployment configuration

- [x] 2.1 Verify current Railway service-root, config-path, watch-path, and health-check behavior against official documentation; add `site/railway.toml` for Dockerfile deployment and `/` readiness, and record the effective settings and documentation references in the runbook.
- [ ] 2.2 Confirm Railway authentication, workspace/project ownership, GitHub repository access, and plan availability before provisioning; record the chosen target or a concrete blocker on TENET-12 without exposing credentials.
- [ ] 2.3 After reviewed deployment files reach `main`, connect a Railway service to `koenvg/Tenet` with root `site/`, explicit config path, website watch paths, and autodeploy; verify effective settings and build logs identify the expected revision and Dockerfile. Check CI-wait support and document whether it is enabled.
- [ ] 2.4 Generate the public Railway domain and configure its target port; verify `/` succeeds over HTTPS and Railway reports the deployment healthy, then add the URL and restoration procedure to `docs/DEPLOYMENT.md`.

## 3. Production acceptance

- [ ] 3.1 Run the smoke check against the generated HTTPS domain and inspect homepage-to-docs navigation and font loading in the browser; attach results with the deployed revision to TENET-12.
- [ ] 3.2 Verify autodeploy/watch-path configuration covers all website deployment inputs and excludes application-only changes, and confirm a known-good revision is available for restoration; record the evidence and any rollback limitations in the runbook.
- [ ] 3.3 Complete the required read-only implementation review, resolve findings, and rerun affected checks; attach final deployment documentation and set TENET-12 to `in_review`, or comment the exact blocker if launch remains incomplete.
