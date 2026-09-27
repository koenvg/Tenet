# Spec Delta

## Purpose

Make TENET's public homepage and setup documentation available over HTTPS without exposing the local application or repository internals.

## ADDED Requirements

### Requirement: Public HTTPS website
The website SHALL be accessible without authentication through a Railway-generated HTTPS domain.

#### Scenario: Read the homepage
- **WHEN** a visitor opens `/` or `/index.html` on the public HTTPS domain
- **THEN** the service returns the TENET homepage successfully

#### Scenario: Read documentation and load assets
- **WHEN** a visitor opens `/docs.html` or follows the homepage documentation link
- **THEN** the service returns the setup documentation and its relative CSS and font URLs load successfully with appropriate content types

### Requirement: Public file boundary
The service MUST serve only explicitly packaged public website content. It MUST NOT expose repository files, deployment configuration, the inspector, or local assessment records. Unknown paths SHALL return HTTP 404 rather than homepage content, and directories without an index SHALL NOT expose file listings.

#### Scenario: Request non-public files
- **WHEN** a visitor requests `/TENET.md`, `/.git/config`, `/Caddyfile`, `/Dockerfile`, `/DESIGN.md`, or `/inspector/`
- **THEN** the service returns HTTP 404 without disclosing those files or directory contents

#### Scenario: Request a missing page
- **WHEN** a visitor requests `/does-not-exist`
- **THEN** the service returns HTTP 404

#### Scenario: Request an asset directory
- **WHEN** a visitor requests `/fonts/`
- **THEN** the service does not return a directory listing

### Requirement: Repeatable production deployment
The website SHALL deploy automatically from the connected GitHub repository's `main` branch when website or deployment inputs change. An operator SHALL be able to identify the deployed revision and restore a previous working deployment.

#### Scenario: Publish a website update
- **WHEN** a website change reaches `main` and its deployment succeeds
- **THEN** the generated HTTPS domain serves that revision's content and the deployed revision is identifiable in deployment records

#### Scenario: Ignore unrelated changes
- **WHEN** a commit changes only application code outside the website's deployment inputs
- **THEN** it does not trigger a website redeployment

#### Scenario: Restore a working revision
- **WHEN** an operator redeploys a previously verified revision after an unsuccessful update
- **THEN** the same public domain serves the restored website

### Requirement: Deployment readiness verification
The deployment SHALL check that the homepage is served successfully before treating a new instance as ready. Completion evidence MUST include live HTTPS checks of the homepage, documentation, assets, and non-public paths.

#### Scenario: Unhealthy instance
- **WHEN** a new instance cannot serve the homepage successfully
- **THEN** the readiness check fails and the deployment is not reported as healthy

#### Scenario: Record successful launch
- **WHEN** the first production deployment passes the live checks
- **THEN** the task records the public URL, deployed revision, and verification results
