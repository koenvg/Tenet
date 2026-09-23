## Purpose

Let the owner open TENET's existing local decision inspector from the active Pi session while preserving the independent archive browser and its read-only access rules.

## ADDED Requirements

### Requirement: Start inspector on demand from Pi
The TENET Pi extension SHALL expose `/tenet-inspector`. When invoked, the command SHALL start a loopback-only read-only inspector against the configured recording archive, show the owner a usable local URL selecting the active Pi session, and attempt to open that URL in Arc. The URL SHALL contain only the existing opaque session identifier, not submitted evidence. The command SHALL NOT require evaluator credentials or send archive evidence into agent context.

#### Scenario: Current session has recordings
- **WHEN** the owner invokes `/tenet-inspector` in a session with recorded calls and built inspector assets available
- **THEN** the owner sees the URL, Arc is asked to open that URL, and the inspector shows that session's calls

#### Scenario: Current session has no recordings yet
- **WHEN** the owner invokes the command before the session has any persisted assessments
- **THEN** the link selects the active session and shows an empty or waiting state without claiming another session's calls belong to it

#### Scenario: Browser unavailable
- **WHEN** Arc cannot be opened or is unavailable
- **THEN** the owner still sees the usable URL and an explicit browser-launch warning, and no different browser opens

### Requirement: Session-scoped server lifetime
The Pi-launched inspector SHALL remain available during its Pi session and SHALL close when that session shuts down. Repeated command calls in one session SHALL reuse its server rather than create more listeners. This lifetime SHALL NOT affect recording, enforcement, or any independently launched inspector process.

#### Scenario: Repeat command
- **WHEN** the owner invokes `/tenet-inspector` twice in the same active session
- **THEN** both invocations display and attempt to open the same session link through one listening server

#### Scenario: Session replacement or Pi exit
- **WHEN** the owner switches, forks, reloads, starts a new Pi session, or exits after launching the inspector
- **THEN** Pi closes the previous session's inspector server, without stopping recording or an independent inspector

#### Scenario: Resumed session
- **WHEN** a recorded Pi session is resumed and the owner invokes the command again
- **THEN** a newly started server links to the resumed session's retained records

### Requirement: Preserve standalone browsing and handle unavailable assets
The Pi command SHALL use the existing production inspector frontend and read-only archive API. The session link SHALL preselect the active session without restricting access to other archived sessions and projects. A missing or invalid frontend build SHALL fail visibly without leaving a running API-only server; standalone launch SHALL remain usable without Pi.

#### Scenario: Browse another session
- **WHEN** the owner opens the Pi-provided URL and chooses another archived session
- **THEN** that session remains browsable through the same inspector

#### Scenario: Assets not built
- **WHEN** the production inspector assets are unavailable at command invocation
- **THEN** the command reports how to build them and does not claim an inspectable URL or leave a listener running

#### Scenario: Pi is stopped
- **WHEN** the owner starts the standalone inspector after Pi exits
- **THEN** retained sessions remain browsable without starting Pi or making evaluator requests
