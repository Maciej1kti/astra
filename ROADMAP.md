# Roadmap and delivery status

Astra has a working daemon, CLI and browser application. The next release still
needs explicit acceptance and publication decisions. This roadmap summarizes
existing scope as of 2026-10-04; it sets no new deadlines, priorities or acceptance
results. Active project outcomes live in `.project/`, and revision-specific
verification is indexed in [current status](progress/STATE.md).

```text
  Implemented product        Release verification         Supported release
  -------------------        --------------------         -----------------
  sources + durable writes -> device / host / fault  ----> owner approval
  browser + CLI               performance / upgrade       chosen license
  packaging + recovery        fresh-install walkthrough   security policy

  Current position: implemented software with ongoing verification
  Deferred: built-in backup archives and source migration framework
```

## Implemented

| Area | Delivered behavior | Reference |
| --- | --- | --- |
| Project storage | Strict JSON sources, stable identity, exact-folder registration and managed project instructions | [Architecture](docs/ARCHITECTURE.md), [JSON decision](docs/ADR-046-JSON-SOURCES.md) |
| Safe mutations | Shared domain/application rules, conditional versions, command identity, recovery, history and conditional undo | [Write contract](docs/04-WRITES-AND-RECOVERY.md), [CLI](CLI.md) |
| Host access | Loopback server, Unix CLI, browser pairing, session revocation and private HTTPS integration | [Installation](INSTALL.md) |
| Core views | Focus, Main, Projects, List, Board, Calendar, Timeline, Updates and Chart | [User guide](docs/USER-GUIDE.md) |
| Counter analysis | Selected histories, overlays, daily/cumulative grouping, statistics and browser-local rate valuation | [Chart guide](docs/USER-GUIDE.md#compare-counters-in-chart) |
| Card workflows | Autosave, checklist, tags, comments, daily counters, inclusive plans and timed events | [User guide](docs/USER-GUIDE.md#create-and-edit-cards) |
| Project context | Folder categories, independent milestones, reports, corrections/resolutions and read receipts | [User guide](docs/USER-GUIDE.md#reports-history-and-deletion) |
| Maintenance | Diagnostics, Git observation, index rebuild, durable workflows and explicit permanent deletion | [CLI](CLI.md), [operations](ops/README.md) |
| Distribution tooling | Source build, host archive, user-service generator, package smoke and stopped-copy recovery | [Installation](INSTALL.md), [recovery](ops/RECOVERY.md) |
| Contributor tooling | Pinned dependencies, contract generation, local/CI checks, browser regressions and evidence records | [Contributing](CONTRIBUTING.md), [development](DEVELOPMENT.md) |

These rows describe implementation. They do not close the corresponding full
release acceptance scenarios.

## Remaining release work

| Workstream | What still needs evidence or a decision |
| --- | --- |
| Device and accessibility | Physical iPhone/Safari editing, touch movement/resize/scroll, desktop/phone use of shared sources and remaining accessibility checks |
| Host installation | Complete macOS ARM64 and Arch/Omarchy installation, login-start, shutdown/restart and filesystem-specific acceptance |
| Reliability | Remaining fault-matrix, physical power-loss, recovery and sustained/soak coverage; preserve unresolved failures and diagnostic limits |
| Performance | Release measurements including transport and rendering, representative datasets and accepted deviations where targets do not hold |
| Compatibility | Old-client/draft behavior, upgrade and stopped-copy restore using compatible sources and operational state |
| Public release preparation | Fresh-install user/agent walkthroughs, current guides, dependency license inventory/notices and revision-specific package verification |
| Maintainer decisions | Project license, supported release approval, private security-reporting channel and supported-version policy |

The authoritative acceptance list remains [RELEASE-CHECKLIST.md](delivery/RELEASE-CHECKLIST.md),
with requirement/scenario IDs in [REQUIREMENTS.json](delivery/REQUIREMENTS.json)
and [ACCEPTANCE.json](delivery/ACCEPTANCE.json). Open historical requirements remain
in force unless an owner decision explicitly supersedes them. A small set of
remaining audit follow-ups is linked from [STATE.md](progress/STATE.md#outstanding-obligations).

## Scope decisions to preserve

- **Kanban feature freeze:** further feature expansion or new Kanban dependencies
  require renewed owner direction. Bug fixes and platform/accessibility/performance
  verification remain in scope.
- **Planning simplification:** card dependencies, milestone links, blocked reasons
  and separate deadline/review dates were removed. Timeline presents explicit
  schedules. Reintroducing those features is not an outstanding implementation task.
- **Milestones and legacy workspace tag APIs:** still supported. Their retirement
  needs an owner decision; do not remove them as documentation cleanup.
- **Backups and migrations:** built-in archives, archive verification/restore and
  a general source migration framework are deferred beyond v1. Stopped-copy
  recovery, operational compatibility and epoch/session protections remain required.
- **Source format:** current sources are JSON. The approved one-time conversion
  does not authorize an automatic migration subsystem.

See [SCOPE.md](progress/SCOPE.md) and the [ADR index](docs/12-ADRS.md) for the decisions
and supersession history. Product expansion such as team roles, cloud sync,
federation, native apps or a plugin system is not automatically part of v1.

## Propose or pick up work

Start with a concrete problem, affected behavior and evidence. For a substantial
feature, open an issue before implementation so scope can be agreed. For a bug,
provide a minimal reproduction and the revision. Coordinate files and contract
changes with other contributors, keep the change focused, and follow
[Contributing](CONTRIBUTING.md). A passing commit or a report does not itself mark
a project card accepted or change its priority.

Dated reports in `progress/` preserve what was tested at that time. Older delivery
plans describe the original sequence, not a live contributor queue. The
[documentation index](docs/README.md#document-authority-and-history) explains how
to resolve those different sources.
