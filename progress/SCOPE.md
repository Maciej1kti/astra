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

## Project field simplification — owner decision, 2026-09-22

Remove project `phase`, `review_on` and `x-*` extensions throughout the product,
including source schemas, API, CLI, projections and editor drafts. The owner
explicitly authorized clearing these fields in the two registered projects
through conditional server writes. Project folders and unrelated content remain
intact. Card review dates and card/milestone/report extensions remain supported.

Project descriptions render Markdown automatically after editing; project
editors are centered with a dimmed, blurred backdrop. Card and project autosave
continues to apply. See [ADR-036](../docs/ADR-036-PROJECT-FIELD-REMOVAL.md).

## Card field simplification — owner decision, 2026-09-22

Remove card `kind`, `expected_result` and `owner` across the editor, source/API
contracts, CLI, projections and existing card sources. Keep card acceptance,
scheduling, review dates and extensions. Report kinds and nested deadline/author
kinds remain separate concepts. The owner requested the same direct description
editing behavior as the project modal.

Because card `kind` was required, a bounded compatibility build permits its
explicit removal through ordinary conditional server writes before the final
strict release. It accepts old source fields for the cleanup and prevents new
writes from introducing them. No general source migration framework or direct
source-file editing is introduced. Archived cards are included in cleanup.

## Compact card checklist and report removal — owner decision, 2026-09-22

Use a simple Checklist in the card modal, with each item occupying one row:
checkbox, text, remove icon and reorder handle. Remove explanatory prose,
per-row counts, arrow buttons and the verbose add-condition subsection.
Preserve stable item IDs and explicit completion; reorder commits on drop.

Remove Record progress and Card updates from the modal, including card-targeted
reports from the source/API/CLI contracts and existing data. The owner explicitly
confirmed the removal of card report functionality. Reports for projects and
milestones remain supported. Remove card Additional fields and `x-*` extensions
throughout the application. Both live projects were inventoried: their five cards
have no extensions, and neither project has card-targeted reports to remove.

## Card connections and planning simplification — owner decision, 2026-09-22

Remove Connections and blockers throughout the application: card milestone links,
dependency edges and blocked reasons, their commands, projections and rules.
Card planning keeps only inclusive schedule Start and End. Remove card `due`
and `review_on`, and remove deadline types globally. Milestones retain their
single date as `due: {date}`. Project/milestone reports, including blocker reports,
remain supported independently of removed card fields.

Timeline and calendar show recorded schedules without dependency forecasts or
card deadline/review markers. Card date attention uses schedule end; milestone
date attention uses its date. Retain archive, focus, checklist, tags, ordinary
version conflicts and durable command recovery. This supersedes dependency and
separate card deadline requirements in older handoff chapters; unrelated release
obligations remain.

The owner authorized removal from existing sources. Five cards across the two
registered projects, including the archived card, were cleared through normal
conditional CLI writes. The only present field was `depends_on` (one actual edge
and four empty arrays). No card deadline/review dates, milestone links, blocked
reasons or milestone documents were present. Bodies, schedules and retained
metadata were verified unchanged; no compatibility bridge was needed.
