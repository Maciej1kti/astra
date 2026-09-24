# ADR-041 — Project source owns Focus pins and tag names (2026-09-24)

Status: accepted for cross-host content consistency. This supersedes the UI and
ownership choices in ADR-028 without changing its legacy API contract.

`CardMetadata.pinned` is an optional boolean in `.project/cards/*.md`. The Focus
membership is the set of cards with `pinned=true` in registered projects. The
browser changes membership through a versioned CardPatch. `workspace.focus`
remains a host-local ordering preference: entries rank pinned cards, and new
pins follow in source position order. An order write must include exactly the
currently pinned cards, so it cannot add or remove membership. Card deletion
checks the source pin. Existing cards without the field are unpinned.

The tag catalog for a project is the set of exact labels on its cards, including
archived cards. There is no second project vocabulary file. Adding a new label
to a card creates a catalog name; removing its last use removes it. The UI reads
`GET /api/v1/projects/{project_id}/tags` for management and suggestions. The
typed CLI `tags list`, `tags preview` and `tags rename` commands use the same
explicitly selected project. The
optional `workspace.tags` vocabulary and its endpoints remain readable and
writable for older clients, but current UI does not update them. They do not
govern project labels. This deliberately avoids synchronizing two copies of
the same names.

A project rename uses `POST /projects/{id}/tags/preview` to save a short-lived
plan of all affected card writes, then `POST /projects/{id}/tags/rename` with
one command identity. The existing workflow journal executes those steps as one
recoverable job, checks each source's observed bytes and card collection
membership, and stops for review on external changes. It is one operation from
the user's perspective, but its file writes are sequential; no all-or-nothing
filesystem transaction is claimed. A target label already present on a card
merges with it while preserving unrelated label order. Archived projects cannot
be renamed. A completed job triggers a fresh catalog read.

Git synchronization of `.project/` carries pins and labels between hosts.
`workspace.json` still contains host paths, locale, timezone, preferences and
Focus order. Existing host-local pins must be migrated once by patching the
union of both host lists on the source cards before expecting identical Focus
membership. The API does not silently infer pins from old workspace entries.
