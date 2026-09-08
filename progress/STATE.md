# Current implementation state

Updated 2026-09-08. The application is implemented and under verification;
full release acceptance remains open. See [scope decisions](SCOPE.md) and the
[release checklist](../delivery/RELEASE-CHECKLIST.md).

## Current work and verification

This checkpoint includes the completed
[maintainability cleanup](maintainability-cleanup-2026-09-08/README.md), CLI work
and important audit fixes. The owner authorized committing and pushing the
verified work to `origin/main` on 2026-09-08. The earlier safety checkpoint
`2a5530a8bb83eec0c3f6f289cac8587aa9d66898` preserves historical artifacts removed
during cleanup. No service deployment is included. Use `git log` and `git status`
to inspect revision and local change state.

The [CLI improvements](cli-improvements-2026-09-08/README.md) are complete:
explicit confirmation semantics, named search/planning
reads, conditional editing/undo, bounded stdin and optional terminal output.
The [CLI guide](../CLI.md) documents the implemented command tree and safe retries.

The [important audit fixes](audit-fixes-2026-09-08/README.md) are complete.
Q02–Q07 address conflict outcomes, journal ownership, typed saved
plans, safe failure diagnostics, maintenance projection repair and workspace
screen/navigation ownership. Q08's typed timeline and Q09's shared browser runtime
are complete; additional named frontend endpoints, smoke scenario separation and
Q10's vendor assumptions remain follow-up work. See
[ADR-033](../docs/ADR-033-AUDIT-OWNERSHIP-AND-RECOVERY.md).

The current local gate passes 174 Rust, 82 JavaScript and 12 Python tests,
contracts/examples, frontend typing, import boundaries, formatters, Clippy and
release builds. Release HTTPS/CLI smoke, planning tests and all eight browser
regression suites pass, including 14 new direct/status conflict cases. The audit
fix record contains current commands, results and artifact locations. Dedicated
CLI workflows passed in the preceding CLI task. A packaged installation/restart/
stopped-copy recovery smoke passed for the preceding cleanup on this macOS ARM64
host; see its record. Remote CI results are not claimed by this local record.

The cleanup removes obsolete artifacts while preserving immutable historical
proof and all delivery requirements. Planning reads, vendor adapters and tag
review have explicit owners; application mutations have named preparation steps,
typed command/workflow identities and useful diagnostic errors. Documentation now
has a maintained user/contributor entry point. The owner deferred licensing.

## Implemented product

- Shared Rust domain, strict source parsing and generated browser contracts.
- Conditional durable writes, stable retries, recovery and resource history.
- Explicit folder registration, host-native selection, pairing and sessions.
- Shared HTTP/Unix application engine, CLI and rebuildable search projections.
- Projects, focus, board, calendar, Gantt, lists and reports against real sources.
- Structured card results/acceptance, relations, targeted updates and workspace tags.
- Versioned settings/focus, read receipts, undo, diagnostics and Git observation.
- Maintenance workflows, packaging and documented stopped-server copy recovery.

Use [Development](../DEVELOPMENT.md) for setup and [Manual testing](../MANUAL-TESTING.md)
for `npm run try`, pairing and the walkthrough. Existing manual runtime data is
not modified by the cleanup or isolated verification fixtures.

## Outstanding release obligations

Remaining product/acceptance work is governed by the release checklist, not old
implementation narratives. Physical iPhone/Safari, Arch/ext4, physical power-loss,
login-start and complete performance/reliability acceptance are not established
by this local run. Chromium phone emulation is not a physical-device test.

The owner must choose the project license and the supported-release security
reporting channel. Retained requirement chapters remain until unresolved
obligations can be retired. Built-in backup archives and source-file migration
frameworks stay deferred; stopped-copy recovery and operational compatibility
remain required. Preserve the Kanban feature freeze from the scope decisions.

[Historical evidence](README.md) applies to its recorded revisions. Older CI or
benchmark results are not automatically evidence for this working tree. No
acceptance scenario was marked passed by this cleanup.
