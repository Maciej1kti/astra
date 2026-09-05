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
