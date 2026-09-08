# Astra

Astra is a local planner tied to explicitly selected folders. Project content lives in
Markdown/YAML under `.project/`; a Rust daemon coordinates conditional, durable
writes. A Svelte browser interface and a Unix-socket CLI use the same application
engine. SQLite provides a rebuildable search index and separate operational state
for sessions, command retries, receipts and history.

The application is under active implementation. See [current status](progress/STATE.md)
and [verification evidence](progress/EVIDENCE.md) for implemented scope and known
limitations. Physical iPhone/Safari, Arch/ext4 and physical power-loss acceptance
are not established. Built-in backup/restore archives and source-format migration
frameworks are [deferred](progress/SCOPE.md).

Features include seven source-backed views, cards and milestones, date planning,
reports and explicit resolutions, shared focus, full-text search, history and
conditional undo. The board supports dragging and keyboard ordering. The Gantt
view connects cards with finish-to-start dependencies and previews their impact
on the project finish.
The calendar provides day, week, month and agenda views with movement, resizing
and keyboard alternatives. Planning widgets are pinned MIT dependencies; see
[planning implementation and verification](progress/E026-planning-widgets.md).
Browser access requires pairing; the CLI requires the server's Unix socket. No write command falls back to editing files directly.

## Start here

- [Run from source](DEVELOPMENT.md) for setup and toolchains.
- [Try the interface](MANUAL-TESTING.md) for pairing and a guided walkthrough.
- [Install a built package](ops/PACKAGE.md) for daemon and CLI installation.
- [Contribute](CONTRIBUTING.md) for code ownership, checks and change conventions.
- [Documentation](docs/README.md) for architecture, contracts and retained requirements.

After completing development setup, run `npm run try`. It uses persistent
synthetic data under ignored `.manual/`. The binaries retain their existing names:
`projectd` is the daemon and `projectctl` is the command-line client.

## Run and package

Use [development instructions](DEVELOPMENT.md) to build the pinned Rust/Svelte
workspace. Run all local checks with:

```sh
.venv-check/bin/python scripts/check.py
```

Release packages include the daemon, CLI, embedded frontend and a user-service
configuration generator. See [installation](ops/PACKAGE.md). Runtime use does not
require Node.js or Docker. The daemon listens on loopback; configure an owner-managed
private HTTPS proxy before using the browser. The installer does not enable a
service or change network settings automatically.

## CLI

See the [CLI guide](CLI.md) for named commands, readable text output, stdin input
and safe retries. `--socket` can be supplied once through `ASTRA_SOCKET`.

Select a registered folder explicitly; parent folders are never searched:

```sh
projectctl --socket /absolute/state/projectd.sock --project /absolute/project context
projectctl --socket /absolute/state/projectd.sock --project /absolute/project card list
projectctl --project /absolute/project validate --offline
```

Normal output is one JSON envelope with `api_version`, `ok`, `data` or `error`, and
`request_id`. Exit 9 means an operation is still in progress or its result is
uncertain. Keep the request ID, command epoch, original payload and resource version
when retrying. Read-only offline validation checks source documents without
creating project metadata or requiring a running server.

## Contracts and development evidence

- [Source schemas](contracts/domain.schema.json), [HTTP API](contracts/openapi.yaml),
  [CLI output](contracts/cli-output.schema.json) and [local IPC](contracts/local-ipc.json).
- [Code structure and ownership](docs/CODE-STRUCTURE.md),
  [architecture decisions](docs/12-ADRS.md), [implementation plan](progress/PLAN.md)
  and [acceptance scenarios](delivery/ACCEPTANCE.json).
- Original handoff documents remain temporary implementation references until their
  outstanding requirements are resolved. They are not a claim of product readiness.

All new repository content is English. Fixtures and screenshots contain synthetic
projects; user project data, credentials, runtime state and local dependencies are
excluded from version control.

## Project status and licensing

Astra is being prepared for a supported open-source release. The project license
will be selected by the owner before that release; no license choice is implied
by this documentation. See the [release checklist](delivery/RELEASE-CHECKLIST.md)
for outstanding acceptance and publication decisions.
