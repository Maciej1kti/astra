# ADR-034 — Permanent card and project deletion

Date: 2026-09-22. Status: owner-authorized implementation.

The owner requested deletion without restoration, explicitly defining project
deletion as physical removal of `.project/` and card deletion as physical removal
of the corresponding source file. This replaces the trash proposal in the
[review](../progress/2026-09-22-deletion-review.md) and extends ADR-012's earlier
archive/unregistration behavior. Archive remains a separate action.

## Public behavior

`DELETE /api/v1/projects/{project_id}/cards/{card_id}` takes an empty JSON object
and the observed card version in `If-Match`. It physically removes that source
file. Incoming dependencies, including archived sources, block deletion; the
caller must explicitly disconnect them first. A pinned card must be explicitly
removed from focus before deletion. Card-targeted reports are subsequently
removed by [ADR-038](ADR-038-CARD-EXTENSION-REMOVAL.md); project and milestone
reports remain append-only. Resource history exposes deletion with a null
`after_version` and does not offer undo for a deleted source.

`GET /api/v1/projects/{project_id}/deletion-plan` reads the exact `.project/`
scope and returns its path, file count, bytes and an observed deletion version.
That version covers the workspace registration and complete bounded tree
inventory, including source contents and filesystem identities. It is not the
version of `project.md`. `DELETE /api/v1/projects/{project_id}` takes an empty
JSON object and this preview version. It removes the inventoried `.project/`
tree and its registration/focus references. Files outside that directory,
including repository contents, root AGENTS instructions and `.gitignore`, remain
outside the operation. Changed or added entries invalidate the confirmation.

Both commands return the ordinary durable command envelope. The result identifies
the target with `deleted: true` and has no live resource/version. There is no trash,
restore endpoint or automatic recreation. Existing local maintenance unregistration
still preserves sources; it is a different administrative operation.

## Durability and concurrency

Auth, epoch, command admission and replay happen before destructive source lookup.
A known original request remains queryable/replayable after its target disappears.
An absent response or HTTP 202 preserves the original identity, payload and
precondition. A definitive conflict requires a deliberate new user intention.

Card deletion stores an explicit absent after-state, never an empty document or
invented file hash. Its ordered steps are durable prepare, verified unlink,
directory synchronization, and durable command/history commit. Recovery can finish
an already absent target or delete the still-matching original source. A changed
file, new symlink or changed reference blocks recovery. It never recreates the
deleted source from journal bytes or the index.

Project deletion is a durable operation with a finite inventory and progress.
Persist the reviewed paths and expected hashes/identities before removing any
entry. Remove only those entries, synchronizing their parents and removing only
empty directories. Never use an unbounded recursive removal that could consume
new files. Resume from recorded progress and reject unexpected remaining entries.
The writer lease and global workspace gate protect cooperating writers; preserve
the documented limit against non-cooperating external editors.

Startup resolves or quarantines pending project deletion before opening ordinary
project stores. Opening a partially removed store can create `.local`, so it is
not a valid deletion recovery strategy. Pending deletions must block competing
workspace/source mutations. The workspace change also retains its observed
version; recovery cannot merge an unrelated edit by refetching and overwriting.

Success requires both physical deletion and the durable workspace/command result.
Projection repair follows this boundary and cannot turn an acknowledged operation
into failure. The index is never used to reconstruct deleted content. Operational
schema upgrades preserve command epochs, existing history and unresolved writes.
Journal content follows its existing recovery/retry retention; this feature does
not promise secure erasure of backups, Git history or operational storage.

## Client behavior and verification

The browser presents an explicit permanent-deletion confirmation. Project
confirmation uses the preview returned before the user commits and names the exact
directory. It retains drafts, locks unresolved commands and uses the shared command
controller for direct replies, status checks and identical retries. Navigation
changes only after commitment, including deletion of the selected or final project.
CLI commands use the same server operations; project deletion uses an explicit ID
so retry does not depend on an already deleted folder being registered.

Regression coverage must exercise stale previews/versions before side effects,
dependency and focus checks, auth/CSRF, changed files and symlinks, filesystem and
journal crash boundaries, safe recovery/replay, preservation of the enclosing
repository, migration compatibility, projection failure and browser uncertainty/
draft handling. Record actual test results and platform limits in `progress/`.
