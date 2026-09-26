# ADR-045: Source-owned card comments

Date: 2026-09-26. Status: accepted by owner direction.

Cards have an optional ordered `comments` array in their Markdown front matter.
Each entry contains a server-generated UUID, UTC `recorded_at`, an `author`
(kind `human` or `agent`, label, optional session ID), and a Markdown `body`.
The existing author contract is reused; the UI calls agents **Bot**. Author kind
and name are declared attribution, not proof of a separate authenticated identity.
The current owner/session authorization still gates every command.

The existing conditional CardPatch endpoint accepts a separate
`{ append_comment: { author, body } }` variant. It cannot be combined with field
replacement or undo. Creation, set and clear do not accept comment history.
Ordinary edits preserve it, and undo cannot remove or rewrite comments. The
source file owns the entire conversation, so copying a project's sources keeps
comments without a separate service or host database. Description Markdown stays
independent of comment Markdown. Existing cards need no source rewrite.

Comments use the normal prepare/write/commit transaction, observed version,
request ID, epoch and replay result. Concurrent appends conflict explicitly;
no refetch-and-overwrite or automatic duplicate resubmission is introduced.
Server-generated IDs/timestamps are included in the prepared source and durable
reply. Uncertain retries return the original result. Comments are append-only
through normal APIs, not tamper-proof against explicit source-file edits.

The editor flushes valid autosaves before adding a comment, preserves unfinished
comment text during ordinary saves and navigation guards, and clears it only on
confirmed commit. Existing uncertainty/status controls govern comment commands.
The browser now supplies human/Owner attribution without author fields (owner
direction, 2026-09-26); both human and bot attribution remain available through
the CLI/API. The composer appears before saved history. Lists, Focus
and Board show comment counts; all card editors show the conversation. Search
indexes comment bodies/author labels, and bounded agent context includes comments
or an explicit next resource read. Calendar/Timeline cards open the same editor.

Limits: 200 comments per card, 4000 Unicode characters per comment, nonblank body
and author, unique IDs, and the existing 64 KiB front-matter / 1 MiB document
limits. The aggregate header limit may be reached before the count limit; failed
writes preserve existing history. Comments are rendered using the same safe
Markdown renderer as descriptions. Editing/deleting comments, threaded replies,
notifications and verified multi-user identities are outside this change.
