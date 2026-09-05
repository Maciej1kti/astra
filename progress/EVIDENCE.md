# Implementation evidence

## E006 — workspace and history, 2026-09-05

See [E006](E006-workspace-history.md) for durable workspace writes, conditional undo
and real browser verification of focus and persistent preferences.

## E005 — transport and connected UI, 2026-09-05

See [E005](E005-transport-ui.md) for the verified HTTP/Unix/browser slice and its
remaining scope, and the full check and browser logs linked there.

## E004 — application engine, 2026-09-05

See [E004](E004-application.md) for registration, sessions, indexing and resumable
workflow recovery evidence. Committed and pushed as `a7a822a`.


## E003 — durable commands and subprocess recovery, 2026-09-05

Application journal and one-file writer now persist epoch, UUIDv7 admission floor,
payload/precondition digest, original results, PREPARED bytes, reference versions
and history. Source writes occur outside the DB mutex. Retry resolves stored
results before checking stale versions; rejected outcomes are stable and no-ops
do not rewrite source or append content history.

Ten application integration tests passed, including a separate process exiting at
each of six commit boundaries. Restart recovers the intended result exactly once,
keeps epoch unchanged and replays the original response. Tests also cover stale
versions, changed payloads, missing preconditions, expired/future IDs, clock
rollback, state loss/new epoch, replaced source symlinks, changed references,
invalid source preservation, and state databases larger than document limits.
Success/error/pending response bodies are validated against OpenAPI.

Full local checks passed: [journal log](checks/journal.txt). Total Rust tests: 27
(including the subprocess harness entry). These are controlled process-failure
tests on macOS, not physical power-loss or full fault-matrix certification.
Pending work includes command retention/maintenance, registration workflows,
projections, transport authentication, Linux and physical device checks.

## E002 — strict document storage foundation, 2026-09-05

T04/T06 implementation is in progress. `project-store` now parses bounded YAML
events with saphyr-parser, rejects duplicate keys/anchors/tags and invalid source
IDs, preserves Markdown body bytes, and exposes normalization-required for comments
and BOM/CRLF headers. Canonical headers use quoted JSON scalars and flow values,
a YAML 1.2 subset. No custom YAML scanner is implemented.

Filesystem access uses rustix directory descriptors, NOFOLLOW, regular-file and
hardlink checks, directory identity verification, an exclusive writer lease,
conditional atomic replace/no-replace create, file/directory sync and macOS
F_FULLFSYNC. A failure after rename retains the new source for journal recovery.
The journal and application dispatcher are the next layer; this is not yet a
complete durable command implementation.

Validation: 17 Rust integration tests passed (7 domain, 5 document, 5 filesystem),
including all 6 parser vectors and body/comment/UTF-8/symlink/race scenarios.
Full local fmt/clippy/tests/release/Svelte/OpenAPI sequence passed:
[store check log](checks/store.txt). Environment matches E001. No physical power
loss, Linux/ext4, phone or server test is claimed.

Owner decisions: public GitHub repository `Maciej1kti/astra`, English for all new
repository content, regular verified commits and pushes. Recorded in `AGENTS.md`.

## E001 — fundament G0, 2026-09-05

Zadania T01–T03; częściowe T05 (daty/rank/graf). Checkout `main`, bez commita.
Host macOS 27.0 (26A5425a), ARM64, Python 3.14.6, Node 24.11.0, Rust 1.92.0.
Nie testowano przeglądarek ani urządzenia mobilnego.

| Polecenie / kontrola | Rzeczywisty wynik |
|---|---|
| `python scripts/check_package.py` przed zmianami | PASS 12 grup, w tym oryginalne sumy; 33 wektory referencyjne, 39 ścieżek/49 operacji OpenAPI. |
| `python -m openapi_spec_validator contracts/openapi.yaml` | OK, pełna walidacja OpenAPI uzupełniająca handoff. |
| `scripts/cargo-local test --workspace --locked` | 7 testów integracyjnych domeny PASS: 6 przykładów, 14 dokumentów + 5 dat + 5 grafów + 3 ranki z handoffu; granice bytes/depth/nodes, NUL/unsafe keys, fractional timestamps i graf 10 000 węzłów. |
| `python -m unittest discover -s scripts/tests` | 3 testy PASS: obowiązkowy dowód postępu, statusy i pomijanie katalogów zależności. |
| Rust fmt / clippy `-D warnings` / release build | PASS dla obecnego workspace domeny. Nie jest to build serwera. |
| `npm run check` | Typy wygenerowane zgodne; Svelte/TypeScript 0 błędów, 0 ostrzeżeń. |
| `npm run build` | PASS; JS pustego shellu 23.09 kB (9.47 kB gzip), CSS 0.26 kB. To nie benchmark docelowej aplikacji. |
| `npm install` | 0 znanych vulnerabilities według npm podczas tej instalacji; nie pełny audyt Rust/licencji. |
| `.venv-check/bin/python scripts/check.py` | PASS pełnej lokalnej sekwencji. |

Artefakty: [baseline](checks/baseline.json), [pełny log G0](checks/g0.txt).

Scenariusze A14/A16/A51 mają częściowe podstawy, lecz nie zostały zaliczone:
A14 wymaga parsera i zmiany pliku, A16 adapterów wszystkich widoków, A51 całego
łańcucha adapterów. A42 wymaga instalacji na obu hostach. Wszystkie acceptance
pozostają `not_run`; nie wykonano serwera, fault injection, E2E ani testów telefonu.

## E007 — Reports, bounded views and owner scope adjustment

- Added durable read receipts, attention semantics, project-scoped byte-bounded
  context, calendar/board/Gantt projections and paginated global resource lists.
- Added protocol examples and transport/schema coverage; UI reports expose read
  state and preserve pinned resources outside the current page.
- Full automated checks passed (`progress/checks/reports-views.txt`): 46 Rust
  tests, Python contract checks, Svelte checks and release build. HTTPS browser
  smoke also passed including read receipts, conflict preservation and undo.
- This does not establish complete date interactions, archive-scale performance,
  Linux or physical iPhone behavior.
- Owner deferred built-in backup/restore and source-file migration tooling;
  `progress/SCOPE.md` overrides those portions of the original handoff.

## E008 — Native source observation and passive sessions

- Replaced unconditional two-second source scans with native notifications, a
  bounded 1,024-event channel, 100 ms quiet/500 ms maximum debounce and 15-minute
  reconciliation. The two-second registry check reads workspace/directory metadata.
- Normal writes and source-file events now reindex their named documents only;
  invalid, deleted and recreated files retain correct isolated projection behavior.
- SSE wakes on index changes and sends an initial comment to flush proxy headers.
  Passive stream checks enforce expiry without extending idle lifetime.
- Full checks passed (49 Rust tests); HTTPS browser smoke observes an external
  file edit through the native watcher. Logs: `checks/native-watcher.txt` and
  `checks/browser-smoke.txt`. Dependency: pinned notify 8.2.0; native behavior
  verified only on the available macOS host, not Linux or a physical phone.
- Archive-scale benchmarks, notification overflow/failure diagnostics and active
  project reconciliation on foreground return still need completion.

## E009 — Typed CLI, safe preview and date interactions

- Added exact-folder CLI resolution and typed card/milestone/report/context/focus
  commands, bounded file reads, transport timeout and uncertain-result reporting.
- Added safe Markdown preview (raw HTML and images disabled), explicit common
  metadata fields, dependency search and dirty-draft protection.
- Calendar now uses distinct schedule, deadline and review resources. Lazy-loaded
  timeline supports move/resize proposals with conditional save and preserved
  conflict drafts. Source date warnings remain stable in command replay.
- Full local checks passed: 51 Rust tests, 3 Node tests, Python/contract checks,
  Svelte with zero warnings, release build. See `checks/editor-cli-dates.txt`.
- Browser smoke verifies typed CLI, Markdown safety, a one-day timeline move with
  unchanged due date, resize conflict and Escape/pointercancel/orientation/second
  pointer cancellation. See `checks/browser-smoke.txt`, `screenshots/desktop-timeline.png`.
- A failing regression reproduced registration retry after a project disappeared
  across restart; checking the durable result before opening the folder fixes it.
- Not a complete gesture or release claim: physical touch behavior, calendar drag
  trials, timeline milestone rows/edge rendering and large-data virtualization
  still need work.

## E010 — Maintenance, retention, packaging and measured queries

- Added local plan/apply workflows for normalization, rebalance, relocation,
  unregister and index rebuild. Tests cover intervening edits, moving a live
  registered folder, preserved files and release of the writer lease.
- Root-revocation regression failed before the fix and now rejects old browser
  registration plans; known completed results remain replayable.
- Added actual state schema version guarding, one-time restored-state epoch/session
  reset, stopped-server recovery instructions and bounded optional retention.
- Full checks passed: 56 Rust tests, 3 Node tests, 4 Python tests, protocol checks
  and release build. See `checks/maintenance.txt`.
- Added host packaging and a temporary-prefix installer test. The installer only
  generates a reviewable user-service configuration. No service or network setup
  was enabled on the owner's machine. CI for Ubuntu 24.04/macOS 15 is configured;
  success must be observed separately.
- Synthetic release profile: 100 projects, 10,000 cards, 50,000 short note reports;
  200 measured samples after 20 warmups. Query p95 19.72 ms, attention p95 31.35 ms,
  durable mutation p95 110.37 ms. Initial attention p95 was 322.52 ms; targeted
  indexes reduced its scan cost. Logs `checks/benchmark-standard.txt` and
  `checks/benchmark-indexed.txt`; benchmark source is in application/examples.
- These are application-level timings on a shared macOS ARM64 development host,
  excluding HTTP/VPN/browser latency. Notes do not stress decision-resolution
  graphs. Startup 8.06 s and reconciliation 5.03 s remain separate costs. RSS,
  overloaded profiles, physical device/platform tests and release acceptance
  remain unclaimed.

## E011 — Bounded interactive views and maintenance preconditions

- Board pages hold at most 50 cards per column and expose drag and keyboard
  placement. Date and list pages replace bounded pages instead of accumulating
  all rows. List/report searches query indexed title and body text.
- Timeline pages include milestones and visible dependency connectors; calendar
  weeks align to workspace week start, including neighboring month dates.
- Date and registration requests retain their identity while outcomes are unknown.
  URL view/project/filter/resource state supports direct navigation. Browser-local
  light/dark/system appearance contains no project data or credentials.
- Failing regressions proved and fixed rebalance collection changes, stable missing
  receipt rejection, missing collection reads and index jobs finishing before their
  projection succeeds. Index completion resumes after restart.
- Native watchers reattach after directory identity changes and reconcile newly
  watched paths. Watcher initialization failure falls back to 30-second scans.
- Full local checks passed: 60 Rust tests, 3 Node tests, 4 Python tests, contracts,
  zero Svelte diagnostics, strict Clippy and release build (`checks/full-check.txt`).
- Extended real HTTPS browser smoke passed: drag and keyboard ordering, pending
  date request retention, milestone timeline, aligned weeks, body search and dark
  appearance persistence, in addition to previous tests (`checks/browser-smoke.txt`).
  An earlier timeline refresh timeout did not recur in later runs; it is not proof
  of all reconnect/drag races. Screenshots are synthetic browser fixtures.
- CI for commit 3625b18 passed on Ubuntu 24.04 and macOS 15, run 33979005959.
  This does not establish physical iPhone, Arch/ext4 or physical power-loss coverage.

## E012 — CLI outcomes, read-only validation and live-client races

- CLI now emits the documented JSON envelope and stable exit codes. Accepted or
  uncertain writes exit 9 and preserve request ID/epoch, including malformed
  responses. A failing wire regression preceded the response-handling fix.
- Added online and offline document validation using the same source parser. The
  offline path needs no socket, creates no metadata/lease and never searches a
  parent project. Its declared scope is individual documents, not a graph audit.
  Directory enumeration now has a 100,000-entry bound; diagnostics cap at 200.
- A failing real-browser test exposed retained confirmed views after session
  revocation. They now clear while editor and date/move proposals remain available
  for explicit copying. Uncertain request identities survive authorization errors.
- A second failing browser test exposed SSE replacing a held drag baseline. Views
  defer incoming projections until release; the proposed write retains its original
  version and correctly conflicts with an external edit.
- Browser reads use three concurrent slots and bounded waiting. Rejected SERVER_BUSY
  reads receive at most two short retries; mutations never use this retry mechanism.
  The HTTPS smoke includes a synthetic busy response to verify recovery.
- Full checks passed: 63 Rust tests, 3 Node tests, 4 Python tests, contract validation,
  zero Svelte diagnostics, strict Clippy and release build (`checks/cli-validation.txt`).
  Extended browser smoke passed with desktop and mobile-emulation draft retention,
  held-pointer SSE conflict and dark appearance persistence (`checks/browser-smoke.txt`).
- CI run 33981873908 for the previous commit passed Ubuntu but failed macOS during
  the resize browser test. The held-gesture changes address a reproduced race; the
  next CI result must still be observed. Physical device claims remain excluded.

## E013 — Foreground refresh, degraded diagnostics and on-demand Git

- Foreground project reads reconcile with a 30-second monotonic TTL; attention
  filtering happens before bounded pagination. Tests cover external source changes
  and project-scoped attention. The browser retains at most 200 attention rows.
- Missing/invalid initialized workspace registries preserve sources and keep doctor
  available. A failing startup regression preceded this change. Diagnostics expose
  bounded issues/jobs and operational counts without source bodies or secrets.
- Git observation inspects exact registered roots and linked worktrees on demand,
  with fixed commands, two slots, two seconds and 2 MiB output. Tests cover unborn
  HEAD, detached worktrees, hostile filters/fsmonitor, ancestor rejection and limits.
  HEAD/index scope explicitly leaves working-tree and untracked changes unchecked.
- A browser regression proved settings drafts were lost on session revocation.
  Settings now preserve uncertain command identity, offer copying and require explicit
  draft discard. Browser gesture hitboxes wait for rendering and enabled controls.
- Full checks passed: 68 Rust tests, 3 Node tests, 4 Python tests, contracts, Svelte,
  Clippy and release build (`checks/diagnostics-git.txt`). Real HTTPS browser smoke
  passed including Git UI/CLI, diagnostics and settings pending-draft preservation.
- Previous CI run 33983014332 passed macOS but failed Ubuntu at a missing browser
  gesture hitbox. The test now waits for visibility/enabled state and layout; the
  next CI run still needs observation. Physical platform evidence is not implied.

## E014 — Manual-test handoff

- Owner redirected the immediate milestone to practical manual testing, ahead of
  additional release hardening. Outstanding release requirements remain recorded.
- Added explicit focus ordering, preserving version and uncertain command identity;
  HTTPS smoke moves a pinned card and verifies persisted order. History now replaces
  bounded pages instead of accumulating all older entries.
- Full local checks passed (`checks/manual-ready.txt`), followed by real HTTPS smoke.
  CI run 33984427678 passed Ubuntu 24.04 and macOS 15 for commit 00bb2bd.
- Packaged release smoke verified checksum, repeated installation in a path with
  spaces, no auto-start, actual daemon/CLI, clean stop/restart and stopped-copy
  recovery. Source bytes remain identical, the index rebuilds and old epochs reject
  writes (`checks/release-smoke.txt`). CI now runs this smoke after packaging.
- Added `npm run try` with persistent ignored synthetic fixtures and loopback HTTPS.
  Normal browser pairing remains required; `npm run pair:try -- CHALLENGE` approves
  only the exact owner-supplied challenge. No service, network or certificate trust
  configuration is installed. The local host and health endpoint were exercised.
- Codex's embedded browser rejected the self-signed local certificate. Manual users
  must use their normal browser and handle its local certificate prompt themselves.
  See `MANUAL-TESTING.md` for launch, pairing, walkthrough and concrete limits.
