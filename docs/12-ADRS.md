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
