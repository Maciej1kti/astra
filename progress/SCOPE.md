# Owner-approved v1 scope adjustment — 2026-09-05

This decision supersedes backup/restore and source migration requirements in the
original handoff, backlog, acceptance scenarios and release checklist.

Deferred beyond v1:
- Built-in backup archives, archive verification and restore plan/apply workflows.
- A general migration framework for project source files and hypothetical future formats.

Still required for v1:
- Document and test a stopped-server copy and recovery procedure for project sources,
  workspace, configuration and operational state. Rebuild the disposable index.
- Version operational SQLite state and apply actual required database upgrades.
- Reject unsupported source schema versions without rewriting them.
- Preserve command epoch and retry protections when operational state is lost or replaced.
- Complete all other product, maintenance, reliability and release work.

Deferred acceptance portions are not passes. T35 and the archive/source-migration
portions of R27, A40, T41 and related release checks move beyond v1; remaining
recovery, compatibility and soak obligations stay in scope.

## Manual-test milestone — owner steering, 2026-09-05

Prioritize a working version the owner can test now. Stop expanding pre-release
hardening and feature polishing before that feedback. Finish and verify changes
already in progress, provide a simple local launch, then hand over for manual use.
Outstanding full-release requirements remain recorded; they are not blockers to
this manual-test milestone and are not silently marked passed.

## Kanban feature freeze — owner decision, 2026-09-07

Finish title-only column creation and per-project view restoration, then freeze
new Kanban features. E024 whole-card dragging and E025 final polish define this
iteration. Further feature expansion or new Kanban dependencies require renewed
owner direction. Bug fixes and remaining platform, accessibility and performance
verification stay in scope. This freeze does not mark outstanding release
acceptance checks as passed or waive the physical-device requirements.

## Permanent deletion — owner decision, 2026-09-22

Implement card and project deletion without trash or restoration. Deleting a
card physically removes its source file from `.project/cards/`. Deleting a
project physically removes its `.project/` directory and its workspace/focus
registration, preserving the enclosing repository and all files outside that
directory. The owner explicitly confirmed the singular `.project/` spelling.

This supersedes the recoverable-trash proposal in the 2026-09-22 deletion review
and the earlier restriction to archive/unregistration for these user actions.
Existing archive and local administrative unregistration remain distinct.
Conditional writes, durable recovery, dependency validation, authentication and
the other architectural invariants still apply. No deletion is authorized against
the owner's remaining live projects as part of implementation verification.
