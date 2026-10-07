# ADR-064: Projects status board

Status: implemented from owner direction, 2026-10-04. Supersedes
[ADR-063](ADR-063-MAIN-PROJECT-STATUS-BOARD.md).

The owner decided that the whole-project status board replaces the former
Projects overview. It keeps the Projects name, icon and canonical `projects`
route; Main no longer has a separate navigation entry, default-view choice,
screen or icon. The eight canonical workspace views are Focus, Projects, Board,
Calendar, Timeline, Chart, List and Updates. The card Board remains a separate
view; since [ADR-071](ADR-071-SHARED-BOARD-ENGINE.md) both render with one
board component.

Projects groups whole projects into Active, Paused and Archived, with local
folder/title filters and the existing source-opening and conditional state
change actions. It retains the two bounded ordinary/archived project list reads,
complete-summary deduplication and projection notices described by ADR-063.
Projects owns the archive-inclusive project cache; ordinary views retain their
separate project context. No project source shape, state, custom column or
position field changes.

Previously saved `Preferences.default_view = "main"` decodes as Projects.
The server normalizes this exact spelling in its in-memory validation input,
then applies the complete current workspace schema and domain rules. A read or
restart does not rewrite `workspace.json`; its observed version still derives
from the original stored bytes. A semantic no-op using either spelling retains
those same bytes and version. An ordinary conditional mutation that changes a
workspace field serializes the current canonical Projects preference as part of
that existing durable write. There is no migration workflow or automatic source
rewrite.

The canonical schemas and generated types expose only `projects`. Runtime
compatibility also accepts the exact lower-case `main` preference spelling in
an incoming `PreferencesPatch`. It validates a normalized copy and decodes the
alias as Projects while retaining the original JSON, request ID, epoch and
expected version for command admission, digest, recovery and replay. A retry
must keep its original spelling: replacing `main` with `projects` under the same
request ID changes its payload and still produces `IDEMPOTENCY_KEY_REUSED`.
Unknown names, malformed values and additional fields remain invalid.

Browser compatibility resolves old `?view=main` routes to Projects and maps
saved local navigation entries to the canonical Projects entry, removing
duplicates without writing server preferences. Existing `projects` routes and
its navigation icon keep their identity. Browser-local order/visibility remains
independent of durable default-view preferences.

Regression coverage starts with the former behavior failing the legacy alias
expectations. It verifies canonical view round-trips, exact legacy preference
decoding, preserved stored bytes/version across open and no-op, rejected invalid
fields, ordinary conditional changes, pending command recovery and unchanged
legacy replay after restart. A changed-payload retry and stale workspace version
remain conflicts. A synthetic prepared journal from the former host also proves
recovery writes its exact saved Main bytes, returns their original version and
replays the original result; compatibility never rewrites a retained intention.
Real-daemon browser checks cover canonical navigation, legacy
routes/order, project grouping, local filters and existing drag/menu state moves.
