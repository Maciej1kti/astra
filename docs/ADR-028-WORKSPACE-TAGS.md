# ADR-028 — Workspace vocabulary and explicit tag rename/merge (2026-09-08)

Status: accepted for the owner-authorized card and tag management stage.

Card labels remain an ordered array of exact strings inside `.project/cards/`.
A card remains understandable when its project is copied or registered in another
workspace. A catalog identifier is not required to interpret a label. The optional
`tags` array in `workspace.json` stores up to 500 distinct vocabulary names, each
containing 1–48 Unicode characters. Opening an older workspace does not add that
field or rewrite its cards. Removing a vocabulary entry does not remove any card
label. Catalog-only changes use the existing workspace command journal, strong
version precondition, file durability and recovery mechanism.

Names are case-sensitive and Unicode-sensitive. `QA`, `qa`, composed and decomposed
Unicode spellings, and historical surrounding whitespace remain distinct. Commas
are ordinary characters. The UI trims newly typed names; it must preserve exact
source values when selecting or displaying an existing name. A rename preview
accepts surrounding whitespace only when that exact target already occurs in the
saved vocabulary or a readable source card. Newly introduced targets must already
be trimmed and nonblank. This also preserves a historical all-whitespace target
when it is explicitly selected. Empty strings and NUL remain invalid. There is no
automatic normalization, collision merge or source-file migration. A deliberate
rename/merge is the way to resolve historical variants.

`GET /api/v1/workspace/tags` combines managed vocabulary with every observed label
from validated source cards, including archived cards and archived projects. Each
entry provides `name`, `managed`, total card `usage`, and per-project counts with
project titles. The returned `version` belongs to `workspace.json`; it is not a
global source-snapshot version. Source reads are protected by each project's
existing lock and may observe different projects at different instants. Usage is
an observation for review, not a precondition that authorizes a later write.

The source scan bypasses the derived search index, so it can discover tags beyond
the first list page and tags from externally edited cards not yet indexed. A bad
card does not suppress readable neighbors. Invalid and inaccessible sources are
reported individually without filesystem paths or source contents. The scan is
bounded to 50,000 card files, the catalog to 10,000 distinct names and detailed
issues to 500, followed by an omitted-issue count when needed. Any issue or bound
makes `complete=false`. Counts in an incomplete catalog are observed lower bounds,
and a zero count must not be presented as proof that a name is unused everywhere.

`PUT /api/v1/workspace/tags` accepts `{tags: [...]}` with the normal request ID,
command epoch, CSRF protection and workspace `If-Match` version. Replacing the
vocabulary cannot write card files. An unrelated workspace preference or focus
change can invalidate the expected version; the client must display that conflict
and must not silently refetch and overwrite a newer vocabulary.

`POST /api/v1/workspace/tags/preview` is an authenticated, CSRF-protected read. Its
body is `{source, target}` with two distinct literal names. It returns at most 500
affected cards with project identity/title, card identity/title, the exact source
version, and the complete proposed replacement label array. When the target is
already on a card, merge removes only the source label and preserves the target's
existing position. Otherwise rename replaces the source in place. Unrelated
labels retain their spelling and order. Preview changes no card or vocabulary
entry and creates no implicit migration job.

The UI applies only the reviewed card proposals through ordinary `CardPatch`
commands. Each command carries its proposal's expected version and its own stable
request ID and epoch. This preserves existing validation, durable source writes,
history and conditional undo. The batch is a sequence of independent operations,
not an atomic multi-project transaction. A success, conflict, rejection or
uncertain result is displayed for every attempted card. Known retries preserve
the original ID, epoch and payload. Reconsidering a conflict requires a fresh
preview and a new explicit operation; there is no force or refetch-and-overwrite.

Archived projects are still counted and their matching cards appear in preview,
with an issue explaining that the project must be restored before applying those
changes. The existing `PROJECT_ARCHIVED` write rejection remains in effect.
Archived cards in an active project follow the normal CardPatch behavior.

An incomplete or interrupted batch retains both names as needed. The UI may offer
another preview for remaining cards. It may offer removal of the old managed name
only as a separate explicit catalog edit after a refreshed complete catalog shows
zero usage. New external edits can still reintroduce that exact string; the next
catalog will discover it as an unmanaged name. No catalog action silently rewrites
or hides those sources.

Acceptance covers exact strings and Polish characters, source reads beyond list
pagination, archived and invalid sources, read-only previews, preserving unrelated
labels, version conflicts after preview, partial completion, command replay and
workspace recovery after a prepared write. The implementation does not claim a
durable cross-project job, automatic browser-reload resumption or collaboration
permissions through the tag vocabulary.
