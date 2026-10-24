# Deploy the public website

Use this guide from a developer checkout to verify Tenet's existing Railway website service. Start with [the service settings](#configure-railway) and [launch record](#launch-record). Do not provision another service. The React website uses the shared shadcn/ui component source in `web/`. Its public server stays separate from the Bun application and local decision inspector.

Local checks need Docker, curl, and Node 22+. The container builds React assets with Bun and locked dependencies. Host checks need no evaluator API keys, database, or persistent volume. The local procedure is CI-tested. Production inspection needs access to the existing Railway project.

## Build and verify locally

This check uses a disposable local container. It makes no evaluator requests and does not deploy or restart a running website service. Docker may download Bun and Caddy images and build dependencies.

1. From the repository root, build and start the check container:

   ```sh
   docker build -t tenet-site:check -f site/Dockerfile .
   docker run --rm -d --name tenet-site-check -e PORT=9090 -p 127.0.0.1:18765:9090 tenet-site:check
   ```

2. Wait for HTTP readiness, then run the full smoke check:

   ```sh
   curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 1 --max-time 5 --retry-max-time 30 http://127.0.0.1:18765/ > /dev/null
   node site/smoke.mjs http://127.0.0.1:18765
   ```

   Success prints `PASS:` with the number of website HTTP checks. The container listens on `PORT`, default 8080. This example uses 9090 to check Railway-style port injection. [Website CI](../.github/workflows/site.yml) runs these build and HTTP checks separately from application and inspector CI.

3. Remove only the disposable check container, even if the check fails:

   ```sh
   docker rm -f tenet-site-check
   ```

### Check React pages in a browser

This optional checkout check needs Bun 1.3.14+, Node 22+, local dependencies and disposable Chromium. It tests static pages with JavaScript disabled, hydration, keyboard controls, motion preferences and desktop/mobile layout. It makes no evaluator requests.

From the repository root, run:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run site:check
bun run site:test
```

Success means both checks exit zero. If Chromium cannot start, install its system libraries with `bunx playwright install --with-deps chromium` on Linux. These checks do not deploy the website.

### Keep the public file list closed

Caddy serves only the generated `site/dist/` output: prerendered `index.html` and `docs.html`, built JavaScript and CSS in `assets/`, the two public font files, and `THIRD_PARTY_NOTICES.txt`. React hydrates the pages in the browser; text, navigation and native disclosures still work without JavaScript. The Dockerfile-specific build context allowlist excludes policies and recordings. Never copy the repository or the whole `site/` directory into the web root.

Deployment configuration, design notes, test scripts, application source, and assessment records are not public assets. Missing paths and asset directory requests return 404. There is no SPA fallback or directory browsing. Caddy's admin API and automatic HTTPS are disabled. Railway terminates public TLS.

## Configure Railway

Inspect the existing service before making changes. The steps below read Railway service metadata and GitHub check results. These authenticated requests disclose project and revision identifiers to those services, not policy or assessment data. Public-site checks need the separate authorization described under [Verify production](#verify-production).

Obtain separate operator authorization before changing service settings, connecting GitHub, enabling autodeploy, generating a domain, or deploying. These actions send source and service settings to Railway and can incur hosting costs. Documentation approval does not authorize deployment or a running service restart. Do not create a replacement service or change billing during inspection.

1. Open the [Tenet Railway project](https://railway.com/project/d574d512-5f50-4a34-9cb7-ec0b8b2f3257) in `koenvg's Projects`. Select `production`, then `website`. Confirm the service ID against the launch record.
2. In Deployments, open the active successful deployment. Record its deployment ID and full Git revision. Do not substitute the latest GitHub commit or a skipped deployment. Compare its configuration snapshot with Settings and this baseline:

   | Setting | Value |
   | --- | --- |
   | Repository | `koenvg/Tenet` |
   | Branch | `main` |
   | Root directory | `/`, the repository root, not `/site` |
   | Railway config file | No selected path. Settings are saved directly in Railway. |
   | Builder | Dockerfile |
   | Dockerfile path | `site/Dockerfile` |
   | Watch paths | `/site/**`, `/web/**`, `/third-party/web/**`, `/package.json`, `/bun.lock` |
   | Health check | `/`, 30-second deployment timeout |
   | Restart policy | On failure, at most 3 retries |
   | Replicas | 1 in US East, Virginia |
   | Start command | No override. Use the container default. |
   | Autodeploy | Enabled for `main` |
   | Wait for CI | Enabled |
   | Domain | `website-production-b64d.up.railway.app` |
   | Domain target port | No explicit override at the recorded inspection. Check routing against the injected `PORT`. |

   A deployment snapshot records the settings used for that deployment. Dashboard settings can describe a later change. If they differ, record both and obtain authorization before correcting them. Do not infer effective settings from `site/railway.toml`.

3. Confirm that Wait for CI is enabled in Settings. Check GitHub results for the deployed revision and Railway's deployment history or logs. Railway may need updated GitHub installation permissions to read check results. Keep this gate enabled. A successful build alone does not prove that CI gated deployment.
4. Confirm the existing domain under Networking. Do not generate another domain. A healthy container can still be unreachable if routing uses the wrong port. Caddy listens on the injected `PORT`, default 8080. Railway terminates TLS, and Caddy accepts the `healthcheck.railway.app` probe.

The expected result is an identified active revision, matching effective settings, and an existing domain. Record differences without changing the service. Use [Verify production](#verify-production) for separately authorized public HTTP and browser checks.

### Maintain settings after config-as-code retirement

Railway's settings UI and [Infrastructure as Code documentation](https://docs.railway.com/infrastructure-as-code) state that legacy config files stop being read on **2026-12-01**. Services that never used Config as Code cannot opt in from **2026-08-28**. Legacy config values override dashboard values while a file is active.

This service already uses direct Railway settings with no selected config-file path. Keep that supported dashboard-managed setup. The repository's `site/railway.toml` is a legacy reference, not the active configuration or a provisioning mechanism. Do not reselect it as a recovery step.

For the maintainer responsible for the next settings change or deployment:

1. Before 2026-12-01, repeat the settings comparison above. Confirm that no legacy file is selected and that the deployment snapshot contains the expected build, watch, health, and restart settings.
2. At the first authorized deployment after the cutoff, compare the new snapshot again. With separate live-check authorization, verify the same public domain. Save the revision, settings, and results with that maintenance task.
3. If repository-managed infrastructure is needed later, propose a separate, operator-approved Railway Infrastructure as Code change. It replaces legacy Config as Code and cannot manage the same service alongside it. Review the plan for the existing project before any apply. Preserve the domain, CI gate, public-file allowlist, and service isolation. This guide does not authorize migration or config-file removal.

## Verify production

Obtain separate authorization before live verification. The smoke check and browser send read requests to the public Railway service, including requests for paths that must return 404. Hosting usage can apply. These reads do not authorize deployment or configuration changes.

1. From the repository root, run the supported smoke check against the existing domain:

   ```sh
   node site/smoke.mjs https://website-production-b64d.up.railway.app
   ```

   Expect `PASS:`. The check covers homepage and docs content, navigation, CSS and font responses, MIME types, font signature, and 404 responses for non-public paths.

2. In a browser, open the homepage, follow Docs and Home, and check that CSS and fonts load without network errors. The `/` readiness probe does not replace this check. Railway's deployment health check is not continuous uptime monitoring.
3. Record the URL, Railway project/service, deployment ID, deployed Git revision, source/root/config/watch settings, CI-wait setting, and results with the current maintenance task. Update the launch record when the verified state changes. Application-only source changes under `src/` do not match the watch paths. Shared UI or dependency changes do trigger a website build.

## A website check fails

- Local container cannot start: check Docker, the name `tenet-site-check`, and host port 18765. Do not remove an unrelated container to free the name or port.
- Local HTTP check fails: inspect `docker logs tenet-site-check` before removing the check container. Use the smoke failure to find the affected response.
- Production is healthy but unreachable: compare the domain target port with the service's injected `PORT`.
- CI gating is unclear: inspect the effective Wait for CI setting, GitHub permissions, and build logs. Do not infer it from `railway.toml`.

## Roll back

Obtain separate operator authorization before a rollback, redeployment, or GitHub revert. These actions change public content, can use hosting resources, and may restart the service. The local checks above do not authorize them.

1. Keep the first verified deployment's revision in the launch record.
2. For a later bad update, use Railway deployment history to redeploy a known-good revision. If it is no longer retained, revert the website change through GitHub and deploy the resulting `main` revision.
3. Verify the deployed Git revision, then rerun the authorized smoke check against the same domain. Do not assume the previous image is still available.

A failed initial launch has no previous working deployment. Fix it before claiming the site is live. Do not delete the service or domain as a routine rollback action.

## Launch record

The dedicated [Tenet Railway project](https://railway.com/project/d574d512-5f50-4a34-9cb7-ec0b8b2f3257) was created in `koenvg's Projects` with owner approval. The original launch did not request or perform a plan upgrade.

### Current recorded state

Verified on **2026-10-24** from Railway service status, deployment metadata, Settings, and GitHub check results:

- Environment `production`, ID `e60873f8-21bc-419f-9aff-3d90251fca9d`.
- Service `website`, ID `e4d603dd-6809-4813-9d26-133f7e7aa288`.
- Public URL `https://website-production-b64d.up.railway.app`.
- Active deployment `69f51b56-cad7-4f13-97fe-19fe1a9737e5`, status `SUCCESS`, created `2026-10-23T10:25:26.490Z`.
- Deployed `main` revision [`4579b3fcc3ca646e596ab3627bf5cc49b41dc09b`](https://github.com/koenvg/Tenet/commit/4579b3fcc3ca646e596ab3627bf5cc49b41dc09b). The newer `b2ec5a980452804548ff41d4d7b1246730939b4a` deployment was `SKIPPED` because no watched files changed.
- Effective build, watch, health, restart, replica, and start-command settings match [the baseline above](#configure-railway). The deployment has an empty file-service manifest, and Settings has no config-file path. Configuration is saved directly in Railway.
- Autodeploy and Wait for CI are enabled. GitHub reports successful [Website container](https://github.com/koenvg/Tenet/actions/runs/39938995586/job/120365491120) and [Offline validation](https://github.com/koenvg/Tenet/actions/runs/39938995612/job/120365491089) checks for the deployed revision. These results and the enabled setting do not alone prove the historical order of CI and deployment.

This inspection did not deploy, change infrastructure, or rerun public HTTP or browser checks. Railway's `SUCCESS` status is not a fresh public-site smoke result. Keep the historical public check below separate from the current deployment state.

### Recovery history

On **2026-10-16**, the authorized recovery corrected the build root from `/site` to `/` and expanded the watch paths to the baseline above. Deployment `1f91f601-1746-4909-93dc-144a6ad41b22` ran revision `3cc151273c63cc5a88e97ce02d365a83d792c314`. The retained command output records `PASS: 26 website HTTP checks` against the same domain. The legacy config-file path did not persist, so the recovery saved settings directly. No source, domain, or billing changes were reported.

The [internal recovery thread](bbthread://thr_mtg9r6ii75) retains the authorization and command evidence. Railway history now marks that recovered deployment `REMOVED`; do not assume its image is available for rollback. The earlier failed deployment `1d9a0553-d8a8-4744-8a09-8c17118c8c4e`, created 2026-10-15, records root `/site`. Preserve this distinction between a failed attempt, a verified recovery, and the currently active deployment.

## Reference documentation

Checked on 2026-10-24:

- [Isolated monorepos, root directory, config path, and watch paths](https://docs.railway.com/guides/monorepo)
- [Legacy Config as Code and configuration sources](https://docs.railway.com/guides/config-as-code)
- [Infrastructure as Code and the legacy retirement deadline](https://docs.railway.com/infrastructure-as-code)
- [Health check port and hostname](https://docs.railway.com/guides/healthchecks)
- [GitHub autodeploy and Wait for CI](https://docs.railway.com/guides/github-autodeploys)
