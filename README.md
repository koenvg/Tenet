# TENET policy guard

Tenet checks Pi tool calls against your rules and shows findings to you, not the agent. Observe is the default and never blocks a call or asks for approval, even when assessment is unavailable. Enforcement needs an explicit new process.

Tenet is in alpha, with Pi 0.85.1 as the tested host. A judge can be wrong. Tenet is not an OS sandbox and does not cover actions outside the host's hooks.

## Before you start

Real assessments send policy text, paths, tool evidence and bounded recent observations to TypeSafe and use quota. Field redaction cannot remove every secret in source, commands or rules. Configure `TYPESAFE_API_KEY` through your secret manager, not in policy, source, chat or command-line arguments.

Local capture is on by default in `~/.tenet/recordings`. Submitted strings can contain secrets despite redaction.

Set `TENET_RECORDING=off` before launching Pi to stop new capture. This does not prevent TypeSafe disclosure, disable native findings or delete old records.

The inspector is read-only and unauthenticated on loopback. Do not expose or proxy it to another machine.

<a id="quickstart-for-pi-owners"></a>

## Start with the archive

This is the recommended path for Pi owners. You need Node 22.19+ with npm, Bun 1.3.14+ and a separate Pi 0.85.1 installation.

1. [Install the production archive](docs/INSTALL-ARCHIVE.md) in a stable directory. It is a private, passing-`main` GitHub Actions artifact with 14-day retention, not an npm package or public release. No build is needed.
2. [Write your first policy](docs/policy.md#write-a-first-rule) yourself, outside the guarded agent's intercepted path. The archive ships no policy. Only `TENET.md` in the session working directory activates Tenet.
3. [Run doctor offline](docs/doctor.md#direct-invocation) in the environment the next Pi process will inherit. Replace both paths:

   ```sh
   TENET_DIR=/absolute/path/to/tenet
   cd /absolute/path/to/project
   node "$TENET_DIR/dist/cli/index.js" doctor --project "$PWD"
   ```

   No global `tenet` command is installed. `ready` means local prerequisites are valid, not verified hooks or provider connectivity. For invalid or unavailable setup, follow [doctor's fixes](docs/doctor.md#fix-invalid-or-unavailable-setup). `off` and `dormant` are bypass states, not passing assessments.
4. Follow [restart and observation steps](docs/INSTALL-ARCHIVE.md#restart-observe-and-inspect-findings). Check `TENET ON OBSERVE` and `/tenet status`. Any real assessed action contacts TypeSafe; a live check needs separate authorization.

## Choose your next task

- [Read findings and open the inspector](docs/inspector.md). Findings, permission and observed execution are different facts. Missing evidence is not a pass.
- [Write rules and manage policy](docs/policy.md), including exact grammar, thresholds and owner-only migration.
- [Fix archive operation](docs/ARCHIVE-OPERATION.md#troubleshooting), manage on/off, opt into enforcement, update or remove Tenet.
- [Configure settings](docs/configuration.md) and check defaults, ranges and restart requirements.
- [Build with the alpha SDK](docs/sdk.md) without Pi, or inspect [host integration duties](docs/shared-runtime.md).
- [Check disclosure, approval and coverage limits](docs/limits.md). Approval covers one unchanged pending call. Stock Pi and Claude action resolution is unsupported; authenticated facts are required for applicability exemptions. The [Claude Code prototype](docs/claude-code.md) is opt-in and unverified. Pi installation or enforce mode does not establish Claude coverage.

Ordinary evidence can support `PASS` without authenticated action resolution. This is not an automatic applicability exemption. See [assessment outcomes and gates](docs/assessment-contract.md#outcomes-and-gates).

## Work on Tenet

[Checkout setup and offline checks](CONTRIBUTING.md) are developer-only. They are not the owner installation path. See the [writing guide](docs/writing-guide.md) before changing documentation.

Tenet source is [MIT-licensed](LICENSE). Bundled assets retain their licenses in [third-party notices](THIRD_PARTY_NOTICES.md). Report vulnerabilities [privately](SECURITY.md).
