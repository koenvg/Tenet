# TENET install archive

This archive contains the Pi extension source and the built local decision inspector. It is not an npm package or a development checkout. It does not include the inspector's editable Svelte source, tests, or evaluation fixtures.

Use Bun 1.3.14+ and Node 22.12+. Unpack the archive at a stable location, then run:

```sh
cd /path/to/tenet
bun install --frozen-lockfile
pi install "$PWD"
```

Restart Pi after installation or code changes. Set `TYPESAFE_API_KEY` through your secret manager before enabling evaluations. TENET stays dormant unless a session has a local `TENET.md` policy or `TENET_POLICY` points to one. Start in observe mode and review the policy and [operation details](https://github.com/koenvg/Tenet#readme) before opting into enforcement. The inspector's frontend is already built at `inspector/dist`; launch it with `bun run inspector:serve` when you have local records to view. The inspector serves local assessment evidence, which may contain secrets, over loopback without authentication.

For development, tests, and editable frontend source, use the repository checkout instead. Kode Mono is embedded in the inspector build; its copyright notice and SIL Open Font License are in `inspector/OFL-Kode-Mono.txt`.
