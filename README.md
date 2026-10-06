# Astra

Astra is a self-hosted planner for work that belongs to a folder. Keep cards,
plans, milestones and progress reports alongside your project, and use the same
data from a browser or the command line.

Project content lives in readable JSON files under `.project/`. A Rust daemon
coordinates durable writes; a Svelte interface provides eight views of that
content. You select every project folder explicitly.

**Status:** working software under active development, with release acceptance
still open. Users build from source. The project is being prepared for open-source
collaboration; **the project license has not yet been selected**. See
[limitations](docs/LIMITATIONS.md) and the [roadmap](ROADMAP.md) before adopting it.

[Build and install](INSTALL.md) · [User guide](docs/USER-GUIDE.md) ·
[CLI](CLI.md) · [Contribute](CONTRIBUTING.md) · [Documentation](docs/README.md)

## What you can do

| Area | Available now |
| --- | --- |
| Organize projects | Register an exact folder, describe its purpose, choose a folder category, pause or archive it |
| Manage cards | Status, Normal/High priority, Markdown, labels, checklists, comments and daily counters |
| Plan dates | Inclusive date ranges or timed events with a start time and duration; independent milestones |
| Work across views | Focus, Projects, List, Board, Calendar, Timeline, Updates and Chart |
| Compare counters | Daily and cumulative charts, selected overlays, statistics and rate-based valuation |
| Record outcomes | Project/milestone reports, explicit corrections and decision resolutions, profile read receipts |
| Automate | Local CLI with JSON output, bounded project context, conditional writes and command recovery; an optional, off-by-default [Agent](docs/USER-GUIDE.md#use-the-agent) dialog that hands a sentence to a local Claude Code or Codex |
| Inspect and recover | Search, change history, conditional undo, diagnostics, Git observations and maintenance workflows |

Card and project editors autosave valid changes and preserve drafts when a write
needs attention. Board ordering, planning gestures and Focus ordering have keyboard
alternatives. Cards can contain human or bot comments and dated counter totals.
The [user guide](docs/USER-GUIDE.md) explains the behavior and its boundaries.

## How it fits together

```text
  Desktop / phone browser                     Local tools / agents
           |                                          |
     private HTTPS                            projectctl (CLI)
           |                                          |
  Your HTTPS reverse proxy                      Unix socket
           |                                          |
           +-----------> projectd <-------------------+
                         Rust daemon
                              |
                 shared validation + durable writes
                              |
              +---------------+----------------+
              |                                |
       Selected project folders          Private host state
       .project/*.json                   workspace + journal
       .project/cards/*.json             sessions + history
       .project/milestones/*.json         rebuildable search index
       .project/updates/*.json
```

One host owns each registered project. Several paired devices can use that host;
the application has shared device pairing and separate trusted user profiles.
Each profile selects its own project folders, settings and Focus order. Paired
people can switch freely between profiles; passwords, roles and private access
restrictions are not implemented. See [choosing a user](docs/USER-GUIDE.md#choose-a-user).
See [architecture](docs/ARCHITECTURE.md) for storage, trust boundaries and code layout.

## Build and try it

Install the [prerequisites](INSTALL.md#prerequisites): Node 24.11.0, Rust 1.92.0,
Python 3.14, a native build toolchain, Git, gzip and OpenSSL. From your clone:

```sh
python3.14 -m venv .venv-check
.venv-check/bin/python -m pip install -r scripts/requirements-validation.lock
npm ci
npm run build
scripts/cargo-local build --workspace --release --locked
npm run try
```

Open `https://localhost:47832` in your regular browser. The trial uses a local
self-signed certificate. Request access, then approve the displayed challenge in
another terminal:

```sh
npm run pair:try -- "CHALLENGE_FROM_BROWSER"
```

Return to the browser and connect. The trial keeps its sample project and edits
in ignored `.manual/`; Ctrl+C stops it. The [installation guide](INSTALL.md) covers
building your own archive, installing the binaries and running a regular host.
The [manual walkthrough](MANUAL-TESTING.md) provides a practical verification pass.

The binaries are named `projectd` and `projectctl`. Existing package/service names
use `local-projects`. A normal installed host serves embedded assets and needs no
Node.js or Docker; the trial launcher uses Node for its local HTTPS proxy.

## Important boundaries

- Browser editing needs a running host and a paired session. There is no offline
  write queue, cloud sync or automatic federation between hosts.
- Timeline shows recorded schedules and milestones. It has no dependency graph,
  critical-path forecast or automatic scheduling.
- Only the search index is disposable. Project sources, workspace configuration
  and operational state all need to be preserved.
- Built-in backup archives and source migration tooling are deferred. Use the
  documented [stopped-server copy and recovery procedure](ops/RECOVERY.md).
- Physical iPhone/Safari, Arch/ext4, power-loss and complete release acceptance
  remain open. Automated browser checks are recorded separately.

See [limitations and platform coverage](docs/LIMITATIONS.md) for the distinction
between product boundaries, unfinished work and unverified behavior.

## Find your way around

| I want to… | Read |
| --- | --- |
| Build, install, pair or update a host | [Installation](INSTALL.md) and [operations](ops/README.md) |
| Understand views and everyday workflows | [User guide](docs/USER-GUIDE.md) |
| Script a change or recover an uncertain command | [CLI guide](CLI.md) |
| Understand the system and locate code | [Architecture](docs/ARCHITECTURE.md) and [code ownership](docs/CODE-STRUCTURE.md) |
| Make a contribution and run checks | [Contributing](CONTRIBUTING.md) and [development](DEVELOPMENT.md) |
| See what is done and what remains | [Roadmap](ROADMAP.md), [current evidence](progress/STATE.md) and [release checklist](delivery/RELEASE-CHECKLIST.md) |
| Find schemas, decisions or historical requirements | [Documentation index](docs/README.md) |
| Report a security concern | [Security reporting](SECURITY.md) |

## Licensing and contributions

The owner will select the project license before a supported open-source release.
Dependency licenses do not select Astra's project license. Generated host archives
include third-party notices; no supported release or security-support period is
declared yet. [Contributions](CONTRIBUTING.md), issue reports and documentation
improvements should describe the affected revision and actual verification.
