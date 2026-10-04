# ADR-063: Main project status board

Status: implemented from owner direction, 2026-10-04.

The owner requested a workspace board for whole projects, alongside Focus,
Chart and the existing views. Name it Main so the per-project card Board keeps
its established meaning. Main groups the selected profile's registered projects
into Active, Paused and Archived columns using `ProjectMetadata.state`.

Main combines the existing ordinary project list and the archived project list
(`GET /api/v1/projects` and `GET /api/v1/projects?archived=true`), retaining their
bounded page reads and projection notices. The existing `archived` boolean means
archived-only when true, and Active/Paused-only when false or omitted. It does
not include both sets in one request. Each cursor retains its archive scope and
limit. OpenAPI now declares this existing query behavior explicitly.
The two scopes can observe a project on both sides of a concurrent archive move.
Main deduplicates IDs by retaining one complete returned summary, including its
original version; it neither merges fields nor claims an atomic combined snapshot.
The ordinary invalidation/read owner refreshes changes, and status writes remain
conditional on the displayed observation.
The shared read owner keeps Main's combined scope separate from the
ordinary project context when entering or leaving Main. Folder/title filters stay
local. Main is a presentation of existing project summaries. It introduces no stored
board, custom columns, project position field or new read endpoint. Selecting a
project retains the existing project navigation and editing actions. Changing
its column uses the existing `ProjectPatch` with only `set.state` and the source
version observed in its project summary. Opening the editor still reads the
current source. No project source shape or state value changes, and shared
profiles still edit the same project sources.

The sole protocol extension is `main` in `Preferences.default_view`. The
profile-scoped workspace preference remains an ordinary conditional durable
write. Browser-local navigation order remains separate from that preference.
Existing route values keep their spelling and behavior; selecting Main does
not replace Focus or the card Board. Older hosts do not accept the new default
value until upgraded; no source migration or format-version change is needed.

Project state writes retain the existing authorization, validation, durability,
conflict and command-recovery rules. An uncertain result retains the original
request ID, epoch, expected version and unchanged payload. A stale version is
never refetched just to overwrite concurrent work. The card Board's existing
status columns and ordering remain independent of Main.

The source schema, OpenAPI and generated representations include the additional
preference value. Regression coverage verifies all default views round-trip,
unknown names are rejected, Main requires an observed workspace version, stale
writes preserve its acknowledged value, and its original command replays after
restart. Examples show the preference payload and existing project state patch.
Authenticated transport coverage verifies ordinary versus archived-only project
pages, observed summary versions, cursor continuation and archive-scope rejection.
Browser coverage exercises project grouping and state changes through the real
daemon, including narrow-screen and keyboard behavior.
