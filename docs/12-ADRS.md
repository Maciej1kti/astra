# 12. Rejestr decyzji architektonicznych (baseline)

## ADR-001 — pliki źródłowe

**Decyzja:** stan projektów w `.project`, nie wyłącznie DB. **Powód:** jawność, dostęp agenta i niezależność od uruchomionej aplikacji. **Koszt:** kontrolowany parser, konflikty i protokół trwałości. **Odrzucono:** dwie równorzędne kopie Markdown/SQLite. Indeks jest odtwarzalny.

## ADR-002 — jeden serwer zapisujący

**Decyzja:** UI i CLI używają koordynatora. **Powód:** host jest zwykle stale dostępny, telefon pisze po sieci. **Koszt:** zwykłe CLI potrzebuje serwera. **Odrzucono:** cichy bezpośredni fallback oraz ukryte uruchamianie kolejnego pisarza.

## ADR-003 — webowy frontend

**Decyzja:** Svelte SPA + Rust API. **Powód:** wymagany browser na telefonie z pełną edycją i dwa hosty. **Koszt:** testy browser/device, narzut klienta web. **Odrzucono:** równoległe SwiftUI/AppKit i frontend Linux bez dowodu konieczności, obowiązkowy wrapper.

## ADR-004 — prywatne HTTPS i parowanie

**Decyzja:** loopback backend, prywatny proxy/VPN, proste sesje właściciela. **Powód:** ograniczona ekspozycja i możliwość odwołania urządzenia. **Koszt:** konfiguracja sieci pozostaje po stronie właściciela. **Odrzucono:** publiczne porty, niejawne zaufanie wszystkim klientom VPN, cloud account produktu.

## ADR-005 — jedna instancja jako workspace

**Decyzja:** focus i aggregate views perinstancja. **Powód:** brak replikacji źródeł i konfliktu gospodarzy. **Koszt:** przełączanie serwerów przy dwóch maszynach. **Odrzucono:** automatyczny globalny focus bez osobnego projektu agregacji.

## ADR-006 — plan != zobowiązanie

**Decyzja:** schedule, due i review_on rozdzielone; daty całodniowe. **Powód:** planner rezultatów, nie timesheet. **Koszt:** widget adaptery i różne markery. **Odrzucono:** drag paska zmienia deadline i algorytm automatycznie przesuwający plan.

## ADR-007 — request window i restore epoch

**Decyzja:** request UUIDv7, ograniczone okno nowej komendy, trwały rejestr i epoch. **Powód:** bezpieczne retry także po usunięciu starych wyników i restore. **Koszt:** kontrola zegara i jawny status uncertain. **Odrzucono:** „idempotencja” przez cache wyników bez polityki wygaśnięcia.

## ADR-008 — append-only raporty

**Decyzja:** correction/resolution jako nowe obiekty. **Powód:** brak nadpisywania historii i mały konflikt zapisów agentów. **Koszt:** projekcja otwartych decyzji. **Odrzucono:** wszystkie raporty w jednym wspólnym dzienniku, automatyczne stosowanie raportu jako patcha karty.

## ADR-009 — indeks i trwały state oddzielone

**Decyzja:** index.sqlite można odtworzyć, state.sqlite i workspace wymagają backupu. **Powód:** rebuild nie może usuwać sesji i focusu. **Koszt:** dwie małe bazy. **Optymalizacja:** read receipts w state, nie przepisywanie workspace na każde przeczytanie.

## ADR-010 — własne kontrakty, wymienne widgety

**Decyzja:** dane widgetu nigdy nie są formatem plików. **Powód:** możliwość wymiany biblioteki bez migracji projektów. **Koszt:** cienkie adaptery i testy round-trip dat. Wybór widgetów wymaga próby mobilnej i sprawdzenia licencji.

## ADR-011 — brak edycji offline

**Decyzja:** nowe komendy wymagają połączenia. **Powód:** wyłączony host jest akceptowanym stanem. **Koszt:** brak w pełni offline planera. **Odrzucono:** service worker/CRDT/replay queue jako obowiązkowy element v1. RAM szkicu i rozstrzyganie wysłanego requestu nie są sync offline.

## ADR-012 — jawna archiwizacja

**Decyzja:** UI używa archiwizacji i rozrejestrowania bez kasowania źródeł. **Powód:** bezpieczeństwo danych i referencji. **Koszt:** osobny proces późniejszego purge. Trwałe usuwanie nie jest skrótem do „naprawy” konfliktu.

Nowe ADR dodawaj do `progress/DECISION-LOG.md`: kontekst, decyzja, alternatywy, dowód, wpływ na kontrakty i testy. Nie traktuj rejestru jako miejsca na każdy drobny refactor.

## ADR-015 — expose shared report read state

The original API accepted read receipts but did not return their state. Add an
optional `read` boolean to update resources and update summaries. It comes from
state.sqlite, never from the Markdown source or disposable index. This additive
field enables the required unread UI without treating reading as resolution.
Ordinary document schemas remain unchanged; receipt commands and their results
commit together in one SQLite transaction. Tests verify source bytes are unchanged.

## ADR-016 — bounded workspace resource lists

Add `GET /api/v1/views/list` with a required resource type and optional project and
field filters. It returns the existing SummaryPage contract and stable index
cursors. This supports the cross-project list and update views without fetching
every project's entire archive or adding an unbounded bootstrap payload. The
per-project APIs retain their contracts. Search uses its documented `q` parameter.

## ADR-017 — Exact local CLI project resolution

The Unix-only POST `/local/v1/projects/resolve` reads the registry for an exact
absolute path. It never searches parents, Git remotes or folder names. Typed CLI
commands require `--project`; `.` is resolved explicitly by the client. This
read-only route is not mounted on TCP and does not register unknown folders.

## ADR-018 — Local maintenance and bounded retention

Local maintenance uses strict tagged JSON inputs and durable plan/apply jobs.
Normalization retains original bytes in the plan and exposes before/after previews;
rebalance preserves order, relocation verifies the project ID at its new explicit
path, and unregister removes only workspace registration/focus references. All
steps recheck their approved directory identities and source hashes. Plans expire
after five minutes and are limited to 32 MiB of before/after data.

A bounded retention pass preserves unresolved operations and at least seven days
of command results. Optional unpinned history expires after 30 days or under a
1 GiB content budget, with up to 500 rows processed per pass. Actual operational
SQLite layouts have a version guard; there is no future source-format converter.
Archive backup/restore remains deferred under the owner scope decision.

## ADR-019 — Bounded full-text resource pages

The global resource-list endpoint accepts optional `q` for full-text search within
one resource type. The list/report screens request bounded pages and replace the
current page instead of accumulating the entire archive in browser memory.
Title-only filters in board/date views remain explicitly scoped to loaded results.

## ADR-020 — Milestones in bounded timeline pages

The Gantt endpoint pages cards and milestones together, using the existing typed
Summary contract. Cards carry schedules and optional deadlines; milestone rows
carry deadlines only. Dependencies remain card-to-card finish-to-start edges.
Board pages continue to contain cards only. The combined page limit still applies.

## ADR-021 — CLI outcomes and read-only source validation

CLI stdout uses `api_version`, `ok`, `data` or `error`, and `request_id`; HTTP
responses also include `http_status`, and mutations preserve `command_epoch`.
Accepted/in-progress or uncertain mutations exit 9. Malformed or truncated replies
after a mutation preserve the same identity, because the write may have committed.
Syntax, transport, missing resources, conflicts and access failures use exits
2, 3, 4, 5 and 6; invalid documents/recovery use 7 and internal failures use 8.
The legacy `{http_status, body}` wrapper is replaced before the first release.

`validate --offline --project PATH` reads exactly PATH/.project without a socket,
writer lease, initialization, ancestor search or modification. Online validation
uses GET /projects/{project_id}/validation and the same parser. Validation covers
individual source documents and normalization needs, with at most 200 diagnostics;
it is explicitly not a claim of an atomic multi-file snapshot or graph audit.

## ADR-022 — Foreground reconciliation and scoped attention pages

An explicit project resource read reconciles its projection at most once per
30 seconds using a monotonic process clock. Native source hints still refresh
individual documents immediately; conditional writes always verify source bytes.
The browser requests this read when its selected project returns to the foreground.

Attention accepts an optional `project_id`, applied before bounded pagination.
The browser retains at most 200 attention signals and exposes explicit next/first
page controls rather than downloading the full attention collection.

## ADR-023 — Diagnostics while the workspace registry is unavailable

A missing or invalid previously initialized workspace prevents project writes but
keeps authenticated diagnostics and local doctor available. Startup does not create
a replacement registry or reconstruct sources from the index. Diagnostics identify
the issue without exposing its contents. A cached operational instance ID is used
when available; otherwise diagnostics explicitly return null.

Diagnostics include at most 100 source issues, 50 unresolved jobs and history
counts/byte limits, with actionable text for registry, clock and recovery problems.
They contain no source bodies, cookies, session tokens or raw database rows.

## ADR-024 — Bounded on-demand Git HEAD and index observation

GET /projects/{project_id}/git and `projectctl --project PATH git` inspect only the
registered repository root. The observer never searches ancestors, polls in the
background, fetches, commits or executes a shell. Two concurrent observations are
allowed, each limited to two seconds and 2 MiB of output. Failure returns an
explicit stale/unavailable observation rather than a clean repository claim.

The result covers branch, commit, conflicted paths and staged paths outside
`.project`. Working-tree modifications and untracked files are explicitly unchecked.
This scope avoids running repository clean/process filters. Fixed commands disable
optional locks, hooks, fsmonitor, external diff and text conversion. Environment
and executable are fixed; timeout kills and reaps the command process group.

Command semantics: [Git diff-index](https://git-scm.com/docs/git-diff-index),
[Git ls-files](https://git-scm.com/docs/git-ls-files), and
[Git symbolic-ref](https://git-scm.com/docs/git-symbolic-ref).

## ADR-025 — Explicit host-native project folder selection

The owner requests an operating-system folder picker without the approved-root
list restriction. An authenticated, CSRF-protected request opens the host's native
dialog (macOS Standard Additions, or Zenity on a Linux desktop). The local human's
selection authorizes exactly the selected folder for a registration plan. No paths,
scripts or shell arguments are accepted from the browser. Normal registration and
its conditional file steps remain the only project-writing operation.

The selection runs outside HTTP workers with one active dialog, a two-minute timeout
and up to 16 session-bound results retained for ten minutes. Repeating a selection
ID with identical input resumes that selection. Polling does not reopen the dialog.
Cancel, timeout and missing desktop support are explicit outcomes. A server restart
loses selection handles but not committed registrations. Mobile browsers open the
dialog on the host; they cannot select a phone folder for the host's filesystem.

[Apple's native folder selection reference](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/PromptforaFileorFolder.html)
provides the macOS command semantics. No browser file-upload handle is mistaken for
an absolute host path. This owner decision supersedes the earlier browser-root-only
restriction for this explicitly interactive host-native flow.

## ADR-026 — Planning widgets and dependency forecasts (2026-09-07)

The owner requested implementation of the researched Gantt/calendar components,
card-to-card waterfall dependencies, and visibility into project completion.
Use MIT SVAR Svelte Gantt 2.7.2 and EventCalendar 5.12.2 as separately lazy-loaded
renderers. Keep the shared editor and versioned proposal transport. SVAR is
configured read-only internally: Astra's tested pointer handles and explicit
connection form own edits, preserving cancellation and conflict semantics.
EventCalendar drag/resize callbacks revert local changes before proposing a write.
No widget REST provider, PRO module, remote assets or paid feature is adopted.

GanttPage now contains required `analysis` and page-local `forecasts` projections.
The domain computes finish-to-start dates for up to 10,000 non-archived,
non-cancelled cards from a single project index snapshot, irrespective of row
pagination. Recorded start dates are lower bounds; durations include both end
dates and weekends. Completed cards retain their recorded schedule because the
model has no actual finish date. Milestone due dates are commitments, not work
durations, and do not extend this card-work forecast. Unknown/invalid/missing
predecessors and cycles prevent a complete forecast. Truncation is explicitly
incomplete. The returned driving path is one deterministic chain determining
finish, not a claim of all critical paths, available capacity or remaining work.

Forecasting never mutates schedules, deadlines or dependency relationships.
Dependencies remain same-project `depends_on` fields checked by the existing
server graph validation. The forecast checkbox is a read-only projection;
users edit recorded dates explicitly. Day view adds navigation within the
existing all-day model; it does not introduce hours, recurring events or a new
source format. Physical iPhone and macOS acceptance still require those devices.

The adapter avoids SVAR's static inline theme/holiday wrappers to retain the
existing strict CSP. Its read-only compact chart mode dereferences a missing
action column in 2.7.2. A minimum-width renderer inside a bounded horizontal
viewport avoids that path, with the title grid collapsed on narrow screens.
Vendor display-mode switches are intercepted; the shared selection/editor
controls remain available. Only bar content receives overflow styling, so the
chart itself retains its native scrolling and virtualization.

## ADR-027 — Structured card purpose and acceptance (2026-09-08)

Following the owner-requested next stage after the UI repair batch, add optional
`expected_result`, `owner` and ordered `acceptance` fields to the shared card
model. Keep Markdown as authored; do not infer or migrate headings into fields.
The owner is a display label for a personal planner, without account assignment
or permissions. Each acceptance item has a stable UUIDv4, bounded nonblank text
and an explicit completion boolean. Item IDs are unique within each card.

Checklist completion and card lifecycle are independent decisions. UI and API
never infer done, review or another status from completion percentages. The
existing versioned card PATCH replaces the checklist atomically with its other
edits; concurrent edits produce a conflict. `clear` removes any optional field.
The ordinary journal, conditional writer and Undo snapshots apply unchanged.
Old cards remain valid and readers do not rewrite them. New optional fields are
supported by the updated server and clients; older strict readers may reject
cards that use the expanded schema, so roll back application versions only after
preserving and explicitly addressing such new content.

List projections include only the owner label and checklist counts, avoiding
hundreds of criterion objects per page. Full-text search indexes expected result,
owner and criterion text. A versioned, transactional upgrade reconstructs the
disposable SQLite search index from its retained source body and metadata. The
stored source body remains separate from search text. Invalid or unavailable
source rows keep their availability state, and project source files remain
untouched. Normal projection refreshes and rebuilds use the same derived text.

Budgeted CLI/API context includes these structured fields intact when the card
fits. Otherwise the existing omitted count and next-read reference identify the
card for a direct read. Checklist entries are never silently shortened to fit.

Keep all existing document byte limits, authorization, idempotency and conflict
rules. The aggregate 64 KiB metadata limit can reject a combination of fields
even if each satisfies its individual character limit. No format migration,
background acceptance or new mutation transport is introduced. Workspace tag
names are separately optional metadata; membership continues to live as exact
label strings on cards, as detailed in [ADR-028](ADR-028-WORKSPACE-TAGS.md).

## ADR-029 — Bounded report history

Report lists support a validated target type/ID filter pair before pagination,
avoiding downloads of unrelated project reports. See
[ADR-029](ADR-029-BOUNDED-REPORT-HISTORY.md) for cursor, source and compatibility
semantics.

## ADR-030 — Recovery-first service startup

The daemon completes recovery before admission, then serves explicitly marked
cached/empty projections while a bounded worker reconciles sources. See
[ADR-030](ADR-030-RECOVERY-FIRST-SERVICE-STARTUP.md).

## ADR-031 — Original command identity and explicit page recovery

Status queries preserve the original epoch, retries own immutable JSON inputs,
and paged views recover from both documented stale-page codes. Typed relation
search applies its resource type before the limit. See
[ADR-031](ADR-031-COMMAND-IDENTITY-AND-PAGE-RECOVERY.md).

## ADR-032 — Scoped page identity and indexed tag suggestions

Project pages use local projection revisions while SSE keeps its global cursor.
Indexed tag names serve bounded suggestions; rename previews still read current
sources. Optional event metadata avoids unnecessary suggestion invalidations.
See [ADR-032](ADR-032-SCOPED-PAGES-AND-TAG-SUGGESTIONS.md).
