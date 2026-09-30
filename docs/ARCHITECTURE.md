# Architecture and repository map

This is the maintained system overview. [Code structure](CODE-STRUCTURE.md) gives
module-level ownership; [contracts](../contracts/openapi.yaml) define the wire
format. [Owner decisions](../progress/SCOPE.md) supersede older requirements.

## Runtime topology

Astra is one user-owned host process with two transports. Browser and CLI commands
enter the same application engine and use the same domain and persistence rules.
The browser is a Svelte 5/TypeScript SPA built by Vite; Rust embeds its production
assets in `projectd`. The server uses Axum/Tokio. `projectctl` is a local Unix-socket
client, not a second writer.

```text
  Browser (desktop / phone)                      Host terminal / automation
       | HTTPS + paired session                          |
       v                                                 v
  Owner-managed reverse proxy                        projectctl
       | HTTP, loopback, preserved Host                  | Unix socket
       v                                                 v
  +-------------------------------------------------------------------+
  | projectd: HTTP / IPC admission, auth, limits, versions, routing   |
  +---------------------------------+---------------------------------+
                                    |
  +---------------------------------v---------------------------------+
  | application: commands, queries, journal, recovery, jobs, index    |
  +--------------------+-----------------------+----------------------+
                       |                       |
             +---------v---------+   +---------v-------------------+
             | domain            |   | project-store               |
             | types, dates,     |   | bounded parser, safe paths, |
             | validation, order |   | source versions, atomic I/O |
             +-------------------+   +-----------------------------+
```

The host listens on `127.0.0.1`, default port 47831. It does not provide TLS, manage
a VPN or expose a public service. The Unix socket authenticates a local OS peer;
browser access uses pairing, sessions, Host/Origin checks and CSRF protection.
There is one application owner with multiple devices, without organization roles.

## Three kinds of state

```text
  /exact/project/                     /private/host-state/  (0700)
  |-- application files               |-- workspace.json
  |-- AGENTS.md                       |-- roots.json
  `-- .project/                       |-- state.sqlite [+ WAL/SHM]
      |-- README.md                   |-- index.sqlite [+ WAL/SHM]
      |-- project.json                |-- projectd.sock    (0600)
      |-- cards/<uuid>.json           `-- runtime lock files
      |-- milestones/<uuid>.json
      |-- updates/<uuid>.json
      `-- .local/writer.lock
```

Collection directories can be created lazily. Host state lives at the explicitly
selected `--data-dir`; the diagram is not a set of automatically discovered paths.

| State | Owner and purpose | Rebuildable? |
| --- | --- | --- |
| `.project/` sources | Project identity, cards, milestones and reports | No; primary project data |
| `workspace.json` | Registration paths, instance preferences, timezone and local Focus order | No |
| `roots.json` | Host-approved directories for browser registration | No |
| `state.sqlite` | Command journal/results, workflows, sessions, receipts and history | No |
| `index.sqlite` | Search and view projections, including FTS5 | Yes, from authoritative sources |
| `.project/.local/`, socket and locks | Local runtime coordination | Runtime only; exclude from Git/copies as documented |
| Browser-local preferences | Presentation such as card section order | Local to that browser; not project content |

Focus **membership** is the card's `pinned` source field. Workspace Focus data
stores the instance's preferred order; it is not a second authority for membership.
Report read receipts are shared operational state, separate from immutable report
content. Index rebuilding is cache maintenance; deleting `state.sqlite` loses
durable user state and requires recovery handling.

Persistent `.project/` sources may travel with their repository according to the
chosen Git mode. This source repository tracks its own planning sources and excludes
`.project/.local/`. Host paths, sessions and ordering do not become cross-host sync
merely because source files are committed.

## Source format

Every resource is one UTF-8 JSON object with `type`, `metadata` and `body`:

```text
  type:      project | card | milestone | update
  metadata:  schema-defined structured fields, IDs and timestamps
  body:      Markdown string
```

See [domain.schema.json](../contracts/domain.schema.json) and the
[validated examples](../examples/README.md) for actual documents. `update` is the
stored/API name for a report; the UI view is **Updates**. `.project/updates/` stores
reports, while a card's conversations live inside that card's `comments` field.

IDs are stable UUIDs and must match filenames. JSON duplicate keys, unknown fields,
invalid types and unsafe paths are rejected. Canonical writes sort keys, use
two-space indentation and LF, and retain the decoded Markdown body. Projects and
cards have closed metadata; milestones and reports permit bounded `x-*` extensions.
Unsupported source schemas are rejected without rewriting them. BOM/CRLF
normalization is an explicit versioned maintenance operation.

Date-only schedules use inclusive civil dates. Timed cards instead hold a local
start and duration interpreted in the workspace timezone. Neither a phone timezone
change nor a widget's date representation changes the domain model. Milestones
have independent dates. There is no card dependency graph or scheduling engine.

## Read path and freshness

```text
  Source file change --> watcher / reconciliation --> index --> bounded view page
           ^                                            |              |
           |                                            +--> SSE ------+
           |                                                 invalidation
  Open for editing --> read current source --> resource + observed version
```

Views use bounded projections; editor reads obtain current source bytes and a
version. A projection is never permission to overwrite a source. The daemon
finishes durable recovery before admitting listeners and marks projections as
reconciling until startup scans finish. Watchers and reconciliation detect external
edits; malformed input remains a diagnostic, not an empty or repaired document.

Focus Attention reads report receipts from durable state before acquiring its
index snapshot and includes that receipt snapshot in cursor identity. Its unread
branch selects an eligible ordered prefix large enough for the requested page;
other reasons keep their ordering and pagination. Receipt membership is checked
before the remaining unread-row eligibility work. Review and decision branches
explicitly use their existing partial indexes, which startup restores for older
projections before admitting reads. Marking a report read affects
its unread entry, while a decision remains until resolved or corrected. Opening
any returned target still uses a current source read.

Tag usage catalogs and rename previews read current validated card files under
each project's existing lock, including external changes not yet reconciled into
the index. A scoped collection reader avoids reopening that folder for each card;
every file still verifies its current lease, parent identity and bounded bytes.
Invalid or unavailable cards produce partial-result issues while readable neighbors
remain visible. Global indexed tag suggestions provide names with projection
freshness; the editor's project picker and tag manager use the current project
catalog. A catalog's version does not authorize overwriting a card.

Server-sent events invalidate client reads. Scoped cursors and snapshot generations
prevent combining incompatible pages. The browser cancels obsolete reads while
retaining active drafts and deferring publication during planning gestures.
Focus can return summaries with its membership snapshot; opening a card still
requires a current source read. A Focus counter preview is a documented narrow
exception: its day/value and card version are observed together, so a total can
be recorded with that version without loading the full card history. See
[ADR-050](ADR-050-READ-RECOVERY-AND-CONFIRMATION.md),
[ADR-051](ADR-051-FOCUS-SNAPSHOT-SUMMARIES.md) and
[ADR-053](ADR-053-FOCUS-DAILY-COUNTER-PREVIEWS.md).

## Write and recovery path

An existing resource requires its observed version, normally `r1.<sha256>` of
source bytes. A durable command has a request ID, epoch, unchanged payload and
original precondition. A retry recovers that command's outcome. A conflict calls
for reconciling intent; fetching a newer version solely to overwrite is not recovery.

```text
  Client reads version V
           |
  Proposes change (V, request ID, epoch, payload)
           |
  Admit + authenticate + check prior command
           |
  Lock + validate current source and references
           |
  Persist PREPARED intention in state.sqlite
           |
  Write temporary source + sync file
           |
  Recheck target + publish source + sync directory
           |
  Persist COMMITTED result in state.sqlite
           |
           +--> acknowledge durable result to client
           `--> update projections and publish invalidations

  Lost response? ----> query/retry the SAME command identity
  Crash? -----------> recovery compares recorded before/after and current bytes
  Unexpected bytes? -> review/block; never overwrite from cached projection
```

The journal and a source file are not one SQLite transaction. Explicit preparation,
file synchronization and result commit bridge that boundary. A projection failure
after commit cannot turn a durable write into a reported rejection. Commands whose
outcome is uncertain retain their identity; an unsuccessful status lookup does not
prove the original command failed.

Lock order is workspace gate, store registry, project store, journal, then index.
Release the registry before locking the project store and release journal
transactions before index notifications. A project writer lease prevents two
cooperating daemons from writing the same project. External processes with the same
UID are not isolated, and an uncooperative file editor is not an atomic participant
in this protocol.

Multi-file registration, maintenance and deletion use durable, resumable workflows
with reviewed plans and job status. They do not promise one atomic filesystem-tree
transaction. Undo is a new conditional command; permanent deletion, append-only
comments and counter history have specific restrictions. See the
[CLI guide](../CLI.md) and [write contract](04-WRITES-AND-RECOVERY.md).

## Repository map

```text
  astra/
  |-- apps/web/              Svelte SPA, feature UI, typed API client
  |-- crates/
  |   |-- domain/            pure domain types, dates, validation, ordering
  |   |-- project-store/     parsing, source bytes, guarded filesystem I/O
  |   |-- application/       use cases, journal, recovery, index, workflows
  |   |-- projectd/          host process, HTTP/Unix admission, auth, watcher
  |   `-- projectctl/        CLI translation, bounded transport, output
  |-- contracts/             JSON Schema, OpenAPI, IPC and SQLite contracts
  |-- examples/              synthetic source and protocol fixtures
  |-- templates/             managed AGENTS block and project setup files
  |-- scripts/               full gate, generators, browser tests, packaging
  |-- tests/                 fault matrix and contract test vectors
  |-- ops/                   installer, service templates, recovery guide
  |-- integrations/omarchy/  optional Linux desktop integration
  |-- docs/                  maintained guides, design, ADRs, retained requirements
  |-- delivery/              requirement/acceptance IDs and release checklist
  |-- progress/              concise dated evidence and scope decisions
  |-- .project/              Astra's own tracked project planning sources
  `-- .github/               CI and contribution templates
```

Application tests live with the Rust crates, including private application test
modules and subprocess durability tests. JavaScript/Python tests live under
`scripts/tests/`, and browser suites under `scripts/browser/`. There is no separate
`integration-tests/` tree to create. Generated types are in
`apps/web/src/lib/contracts/`; regenerate them with `npm run contracts`.

The browser's top-level component composes feature owners. Session, navigation
and view data have separate lifetimes; the command controller retains writes
through uncertainty. Shared modules do not import feature implementations.
[Code structure](CODE-STRUCTURE.md) and the [design system](DESIGN-SYSTEM.md)
identify the exact modules and UI conventions to extend.

## Security and operations boundaries

Repository content and Markdown are untrusted data. Rendering never executes
document instructions, fetches remote preview resources or runs arbitrary shell
commands. API access does not grant an arbitrary filesystem browser. Host-native
selection and approved-root browsing are explicit registration authorities.

Pairing authorizes a browser, while the local CLI acts as the OS owner. Author
labels on comments/reports are attribution, not verified separate user identities.
The server has no public shell endpoint, auto-commit, auto-fetch or multi-host merge.
See [Security](../SECURITY.md), [limitations](LIMITATIONS.md) and
[operations](../ops/README.md) before changing those boundaries.
