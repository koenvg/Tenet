# Proposal

## Why

TENET has a static website in `site/` but no deployment configuration. Publish it on Railway so visitors can read the homepage and setup documentation without cloning the repository.

## What Changes

- Serve the existing homepage, documentation, CSS, and fonts through a Railway service with a generated HTTPS domain.
- Add a small static-server container and Railway deployment configuration, isolated from the CLI and local inspector.
- Connect GitHub deployment from `main`, with changes limited to website and deployment files triggering redeployment.
- Add deployment checks and document setup, verification, and rollback.

## Capabilities

### New Capabilities

- `public-website-hosting`: Public HTTPS access to the static website, safe file boundaries, and repeatable deployment on Railway.

### Modified Capabilities

None. Existing policy enforcement and local inspector capabilities are unchanged.

## Impact

- New container and server configuration under `site/`, plus deployment documentation and focused verification.
- Railway project/service configuration and a GitHub connection to `koenvg/Tenet` are needed during implementation. Account access and billing availability have not been verified.
- No application package dependencies, database, API keys, custom domain, or inspector hosting are required.
- Planning tracks TENET-12. Creating these artifacts does not provision infrastructure or publish the site.
