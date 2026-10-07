# Deploy the public website

Use this guide to check the public website from a developer checkout, then configure a dedicated Railway service. The React website uses the shared shadcn/ui component source in `web/`. Its public server stays separate from the Bun application and local decision inspector.

Local checks need Docker, curl, and Node 22+. The container builds React assets with Bun and locked dependencies. Host checks need no API keys, database, or persistent volume. The local procedure is CI-tested. Remote deployment remains pending, as recorded in [the launch record](#launch-record).

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

Obtain separate operator authorization before creating or changing a Railway service, connecting GitHub, enabling autodeploy, generating a domain, or deploying. These actions send source and service settings to Railway and can incur hosting costs. Documentation approval does not authorize deployment or a running service restart.

1. Confirm the intended workspace and billing plan. Use a dedicated website service, not an existing application service.
2. Wait until the reviewed deployment files are on `main`. Then connect the approved service with these settings:

   | Setting | Value |
   | --- | --- |
   | Repository | `koenvg/Tenet` |
   | Branch | `main` |
   | Root directory | `/`, the repository root |
   | Railway config file | `/site/railway.toml` |
   | Builder | Dockerfile |
   | Dockerfile path | `site/Dockerfile` |
   | Watch paths | `/site/**`, `/web/**`, `/third-party/web/**`, `/package.json`, `/bun.lock` |
   | Health check | `/`, 30-second deployment timeout |
   | Restart policy | On failure, at most 3 retries |
   | Replicas | 1 |
   | Domain | Railway-generated domain |

   The config-file path stays repository-relative with the service at the repository root. Railway control-plane setup must select the root, GitHub source, branch, domain, and CI-wait setting. `railway.toml` does not create or connect a service.

3. Enable autodeploy and Wait for CI in the service settings. Railway may need updated GitHub installation permissions to read check results. Workflows run on pushes to `main`. Check the actual CI-wait setting and build logs before claiming CI gates deployment.
4. Generate a public domain under Railway networking. Match its target port to the injected service `PORT`. Do not enable TLS inside Caddy. Its catch-all host accepts the `healthcheck.railway.app` probe.

The expected result is a dedicated service with the recorded settings and a reachable domain. A healthy container can still be unreachable if its domain target port is wrong. Verify the public site next.

## Verify production

Obtain separate authorization before live verification. The smoke check and browser send read requests to the public Railway service, including requests for paths that must return 404. Hosting usage can apply. These reads do not authorize deployment or configuration changes.

1. From the repository root, replace `YOUR-SERVICE.up.railway.app` with the allocated domain:

   ```sh
   node site/smoke.mjs https://YOUR-SERVICE.up.railway.app
   ```

   Expect `PASS:`. The check covers homepage and docs content, navigation, CSS and font responses, MIME types, font signature, and 404 responses for non-public paths.

2. In a browser, open the homepage, follow Docs and Home, and check that CSS and fonts load without network errors. The `/` readiness probe does not replace this check. Railway's deployment health check is not continuous uptime monitoring.
3. Record the URL, Railway project/service, deployed Git revision, source/root/config/watch settings, CI-wait setting, and results on TENET-12. Application-only source changes under `src/` do not match the watch paths. Shared UI or dependency changes do trigger a website build.

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

Created the dedicated [Tenet Railway project](https://railway.com/project/d574d512-5f50-4a34-9cb7-ec0b8b2f3257) in `koenvg's Projects` with owner approval. No plan upgrade was requested or performed.

The site is not deployed yet. Service creation, GitHub connection, generated domain, and live verification remain pending. The reviewed repository files must reach `main` before production autodeploy is enabled. Local container checks do not establish production readiness.

## Reference documentation

Checked during implementation:

- [Isolated monorepos, root directory, config path, and watch paths](https://docs.railway.com/guides/monorepo)
- [Config-as-code settings](https://docs.railway.com/reference/config-as-code)
- [Health check port and hostname](https://docs.railway.com/guides/healthchecks)
- [GitHub autodeploy and Wait for CI](https://docs.railway.com/guides/github-autodeploys)
