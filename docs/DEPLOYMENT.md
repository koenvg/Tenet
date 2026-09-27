# Deploy the public website

The public website is independent of the Bun application and local decision inspector. It needs Docker to build and Node 22+ to run the HTTP smoke check. No application dependencies, API keys, database, or persistent volume are needed.

## Build and verify locally

Run from the repository root:

```sh
docker build -t tenet-site:check site
docker run --rm -d --name tenet-site-check -e PORT=9090 -p 127.0.0.1:18765:9090 tenet-site:check
curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 1 --max-time 5 --retry-max-time 30 http://127.0.0.1:18765/ > /dev/null
node site/smoke.mjs http://127.0.0.1:18765
docker rm -f tenet-site-check
```

The container listens on `PORT`, defaulting to 8080. The example deliberately uses 9090 inside the container to check Railway-style port injection. `.github/workflows/site.yml` runs the same build and HTTP checks independently of application and inspector CI.

Caddy serves only `index.html`, `docs.html`, `style.css`, `fonts/Geist-latin.woff2`, and `fonts/OFL-Geist.txt` from `/srv/site`. Both the Docker build context and asset copies use allowlists. Add future public assets deliberately and extend the smoke check. Never copy the repository or the whole `site/` directory into the web root.

Deployment configuration, design notes, test scripts, application source, and assessment records are not public assets. Missing paths and asset directory requests return 404. There is no SPA fallback or directory browsing. Caddy's admin API and automatic HTTPS are disabled; Railway terminates public TLS.

## Configure Railway

Confirm the intended workspace and billing plan before creating a project or service. Use a dedicated website service, not an existing application service.

Once the reviewed deployment files are on `main`, connect these settings:

| Setting | Value |
| --- | --- |
| Repository | `koenvg/Tenet` |
| Branch | `main` |
| Root directory | `/site` |
| Railway config file | `/site/railway.toml` |
| Builder | Dockerfile |
| Dockerfile path | `Dockerfile`, within the service root |
| Watch paths | `/site/**`, relative to the repository root |
| Health check | `/`, 30-second deployment timeout |
| Restart policy | On failure, at most 3 retries |
| Replicas | 1 |
| Domain | Railway-generated domain |

The config-file path is repository-relative even when the service root is `/site`. Root directory, GitHub source, branch, domain, and CI-wait selection require Railway control-plane setup. `railway.toml` does not create or connect a service by itself.

Enable autodeploy and **Wait for CI** in the service settings. Railway may require updated GitHub installation permissions to read check results. This repository has workflows that run on pushes to `main`. Verify the actual CI-wait setting and build logs before claiming deployment is gated on CI.

Generate a public domain under Railway networking. Match its target port to the service's `PORT`. Railway injects `PORT` for deployment health checks; a mismatched domain target port can still make a healthy container unreachable. Do not enable TLS inside Caddy. Its catch-all host accepts Railway's `healthcheck.railway.app` probe.

## Verify production

Replace the example hostname with the domain Railway actually allocates:

```sh
node site/smoke.mjs https://YOUR-SERVICE.up.railway.app
```

The check verifies homepage and docs content, navigation links, CSS and font responses, MIME types, font signature, and 404 responses for non-public paths. In a browser, also open the homepage, follow Docs and Home, and confirm CSS and fonts load without network errors. Do not treat the `/` readiness probe as a substitute for this check. Railway's deployment health check is not continuous uptime monitoring.

Record the generated URL, Railway project/service, deployed Git revision, effective source/root/config/watch settings, CI-wait setting, and verification results on TENET-12. Check that application-only changes outside `site/` do not match the watch paths.

## Roll back

Keep the first verified deployment's revision in the launch record. For a later bad update, use Railway deployment history to redeploy a known-good revision and rerun the smoke check against the same domain. If Railway no longer retains that deployment, revert the website change through GitHub and deploy the resulting `main` revision. Verify the deployment's Git revision rather than assuming the previous image is still available.

On a failed initial launch there is no previous working deployment. Fix the failure before claiming the site is live. Do not delete the service or its domain as a routine rollback action.

## Launch record

Created the dedicated [Tenet Railway project](https://railway.com/project/d574d512-5f50-4a34-9cb7-ec0b8b2f3257) in `koenvg's Projects` with owner approval. No plan upgrade was requested or performed.

The site is not deployed yet. Service creation, GitHub connection, generated domain, and live verification remain pending. The reviewed repository files must reach `main` before production autodeploy is enabled. Local container checks do not establish production readiness.

## Reference documentation

Checked during implementation:

- [Isolated monorepos, root directory, config path, and watch paths](https://docs.railway.com/guides/monorepo)
- [Config-as-code settings](https://docs.railway.com/reference/config-as-code)
- [Health check port and hostname](https://docs.railway.com/guides/healthchecks)
- [GitHub autodeploy and Wait for CI](https://docs.railway.com/guides/github-autodeploys)
