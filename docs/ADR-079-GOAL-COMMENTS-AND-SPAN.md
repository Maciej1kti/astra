# ADR-079: Goals: project comments and a derived date span

Date: 2026-10-10. Status: accepted by owner direction, recorded in
[scope](../progress/SCOPE.md#goals--owner-direction-2026-10-10).

The browser renamed projects to **Cele** (goals) and draws a goal like a card:
it carries a conversation and a bar on Calendar and Timeline. Only the Polish
interface text changed. Identifiers, routes, file formats, the CLI and all English
code and documentation keep saying **project**. Two protocol additions let the
browser do this without a service of its own.

## Project comments

Comments mirror [ADR-045](ADR-045-CARD-COMMENTS.md) exactly. `project.json`
gains an optional ordered `comments` array of the same `CardComment` entries
(server-generated UUID, UTC `recorded_at`, declared `author`, Markdown `body`).
The conditional ProjectPatch endpoint accepts a third variant,
`{ append_comment: { author, body } }`, reusing `CardCommentInput`. It cannot be
combined with `set`, `clear` or `undo`. Creation and the other variants do not
accept comment history; ordinary `set` and `clear` preserve it; undo cannot add,
remove or rewrite it and fails with `409 UNDO_COMMENT_NOT_SUPPORTED`, and a
history entry that changed comments reports `can_undo: false`.

The append uses the normal prepare/write/commit transaction, observed version,
request ID, epoch and replay result. Concurrent appends conflict explicitly; an
uncertain retry returns the original result; there is no refetch-and-overwrite.
Limits are those of cards: 200 comments, 4000 Unicode characters per comment,
nonblank body and author label, unique IDs and the existing front-matter and
document limits. Existing `project.json` files without the key stay valid and
are not rewritten.

A daemon built before this decision rejects unknown project fields, so it
reports a `project.json` that already holds comments as invalid. The key
appears only after the first comment on a goal; there is no migration either
way.

Project summaries carry `comment_count` like card summaries, and search indexes
comment bodies and author labels for projects through the same projection text.
Bounded agent context includes the project's comments in the project entry. The
project entry is always sent, so when the entry would pass a quarter of the
requested budget its comments are left out, the entry is marked `truncated` and
`{type: project, id}` is returned in `next_reads`, instead of failing a small
budget. The CLI counterpart is `projectctl project comment PROJECT_ID`. Editing
or deleting comments, replies and notifications stay out of scope.

## Derived span

A project Summary may carry `span: { start, end }` (two civil dates). It is
derived and read-only: the earliest start and the latest end over the project's
non-archived cards' `schedule` and timed `event` dates, using the card date
expressions of the Calendar view (an event ends on the date of its last covered
minute). A card of any status contributes; milestones and archived cards do not.
The field is absent when no such card has a date, and it is present only for
`type=project`. It is not stored, never accepted by any write (`ProjectMetadata`
and every patch reject it) and does not change the project's `version`.

It is computed from the disposable index in one aggregate query for the page,
under the same database guard as the page's rows, so it never outruns them. It
is therefore on every project Summary the server returns: the project list for
both `archived` values and a search that returns a project. A card edit is an indexed change that advances the page
`snapshot_cursor`, so a cursor taken before a card's date edit is refused as
stale and a fresh list shows the new span. `span` is separate from `schedule`,
which clients treat as writable.

## Browser

Goal bars in Calendar and Timeline are read-only: they cannot be moved or resized,
because the span follows from the cards and no write accepts it. A bar opens the
goal. The Polish term is a presentation choice, not a rename of the protocol.
