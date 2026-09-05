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
